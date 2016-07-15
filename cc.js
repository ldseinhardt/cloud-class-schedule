/**
  * Bibliotecas
  */

var d3 = require('d3');

/**
  * Funções Auxiliares
  */

Array.prototype.first = function() {
  return this[0];
};

Array.prototype.last = function() {
  return this[this.length - 1];
};

Array.prototype.max = function() {
  return Math.max.apply(null, this);
};

Array.prototype.search = function(key, value, element) {
  for (var i = 0, len = this.length; i < len; i++) {
    if (this[i][key] == value) {
      return i;
    }
  }
  return this.push(element) - 1;
};

/**
  * Todos os horários para a grade
  */

exports.SLOTS = [
  ['Seg-8',  'Ter-8',  'Qua-8',  'Qui-8',  'Sex-8'],
  ['Seg-10', 'Ter-10', 'Qua-10', 'Qui-10', 'Sex-10'],
  ['Seg-13', 'Ter-13', 'Qua-13', 'Qui-13', 'Sex-13'],
  ['Seg-15', 'Ter-15', 'Qua-15', 'Qui-15', 'Sex-15'],
  ['Seg-19', 'Ter-19', 'Qua-19', 'Qui-19', 'Sex-19'],
  ['Seg-21', 'Ter-21', 'Qua-21', 'Qui-21', 'Sex-21']
];

exports.SLOTS_TOTAL = [];

for (var i = 0, len = exports.SLOTS.length; i < len; i++) {
  exports.SLOTS_TOTAL = exports.SLOTS_TOTAL.concat(exports.SLOTS[i]);
}

/**
  * Leitura dos dados de disciplinas
  */

exports.courses = function(csv_disciplines) {

  var courses = {
    periods: 0,
    list: []
  };

  d3.csv.parse(csv_disciplines, function(d) {

    // se for uma disciplina ofertada irá inserir na lista
    if (/SIM/.test(d['Ofertado'].toUpperCase())) {

      var dsc = d['Nome'].split('/');

      var row = {
        id: parseInt(d['Codigo'], 10),
        discipline: dsc[0].trim(),
        classname: dsc.length > 1 ? dsc[1].trim() : '-',
        periods: parseInt(d['CH'], 10) / 2,
        semester: d['Semestre'],
        courses: d['Curso'].split(',').map(function(course) {
          return course.trim();
        }),
        requirement: 0,
        schedule: [],
        lab: 0
      };

      // contabiliza o número de períodos necessários para lab
      switch (d['Lab'].toUpperCase()) {
        case 'M':
          row.lab += row.periods / 2;
          break;
        case 'T':
          row.lab += row.periods;
      }

      if (d['Pre-requisitos']) {
        row.requirement = parseInt(d['Pre-requisitos'], 10);
      }

      if (d['Horario'] && !/NULL/.test(d['Horario'])) {
        row.schedule = d['Horario'].split('.');
      }

      // verifica se o curso esta presente na lista ou insere
      var i = courses.list.search('course', row.courses[0], {
        course: row.courses[0],
        semesters: {}
      });

      // define a lista para o semestre
      if (!courses.list[i].semesters.hasOwnProperty(row.semester)) {
        courses.list[i].semesters[row.semester] = [];
      }

      // verifica se a disciplina esta presente na lista ou insere
      var j = courses.list[i].semesters[row.semester].search('id', row.id, {
        id: row.id,
        discipline: row.discipline,
        classes: []
      });

      // insere os dados da turma na lista
      courses.list[i].semesters[row.semester][j].classes.push({
        classname: row.classname, // nome da turma
        periods: row.periods, // períodos -> ch / 2
        schedule: row.schedule, // lista de horários (pré fixados)
        requirement: row.requirement, // requisito
        lab: row.lab, // labs necessários -> 0, períodos/2, períodos
        shared: row.courses.slice(1), // informação do curso em que é compartilhado
        professor: 0 // professor da diciplina
      });

      // contabiliza os periodos se a disciplina não estiver pré fixada
      if (!row.schedule.length) {
        courses.periods += row.periods;
      }

    }

  });

  return courses;
};

/**
  * Leitura dos dados de professores
  */

exports.professores = function(csv_professores) {

  var professores = {
    periods: 0,
    list: []
  };

  d3.csv.parse(csv_professores, function(d) {
    // converte ch em periodos
    var min = parseInt(d['Min'], 10) / 2;
    var max = parseInt(d['Max'], 10) / 2;

    // se o professor não estiver de licença
    if (min && max) {
      // insere na lista os dados do professor
      var professor = {
        id: parseInt(d['Codigo'], 10),
        professor: d['Nome'],
        min: min,
        max: max,
        allocated: 0,
        preferences: []
      };

      if (d['Preferencias'] && !/NULL/.test(d['Preferencias'])) {
        professor.preferences = d['Preferencias'].split('-').map(function(p) {
          return parseInt(p, 10);
        });
      }

      professores.list.push(professor);

      // contabiliza os periodos do professor
      professores.periods += max;
    }
  });

  return professores;
};

/**
  * Combinação de disciplinas e professores
  */

exports.match = function(courses, professores) {
  courses.forEach(function(course) {
    var semesters = Object.keys(course.semesters);
    // prioriza disciplinas avançadas como preferência
    semesters.sort(function(a, b) {
      return b.localeCompare(a);
    });
    semesters.forEach(function(key) {
      course.semesters[key].forEach(function(discipline) {
        discipline.classes.forEach(function(cls) {
          if (!cls.schedule.length) {
            var prof = selectProfessor(professores, discipline.id,  cls.periods);
            if (prof < 0) {
              return false;
            }
            cls.professor = prof;
          }
        });
      });
    });
  });
  return true;

  /**
    * seleciona um professor para uma disciplina
    */

  function selectProfessor(professores, id, periods) {
    // filtra os professores que possuem períodos o suficiente para a diciplina
    var profs = professores.filter(function(professor) {
      var p = professor.max - professor.allocated;
      return p >= periods;
    });

    // se não houver mais professores
    if (!profs.length) {
      return - 1;
    }

    // filtra professores com preferência pela disciplina
    var interested = profs.filter(function(professor) {
      return professor.preferences.indexOf(id) >= 0;
    });

    var selected;

    if ((periods % 2) != 0) {
      // se o número de periodos for impar
      // filtra professores com preferêcias com períodos vagos impar
      // sem isso irá faltar professor, pq pode ocorrer de sobrar 1 período por
      // professor, equanto que uma disciplina requistia 2 (exemplo)
      var i_interested = interested.filter(function(professor) {
        return ((professor.max - professor.allocated) % 2) !== 0;
      });
      // se houver professores com preferências, considera os mesmos
      if (i_interested.length) {
        interested = i_interested;
      } else {
        // se não houver professores com preferência e períodos ímpar,
        // verifica todos os professores

        // filtra os professores com períodos vagos ímpar
        var i_profs = profs.filter(function(professor) {
          return ((professor.max - professor.allocated) % 2) !== 0;
        });

        // filtra os professores com períodos vagos ímpar e que não possuam preferências
        var i_profs_not_interested = i_profs.filter(function(professor) {
          return !professor.preferences.length;
        });

        // considera os mesmos, considerando primeiro os professores sem prefêrencias
        if (i_profs_not_interested.length) {
          profs = i_profs_not_interested;
        } else if(i_profs.length) {
          profs = i_profs;
        }

      }
    }

    // se houver um professor com preferencia (se houver disputa pega aleatóriamente),
    // senão pega um professor aleatório
    if (interested.length) {
      selected = interested[Math.floor(Math.random() * interested.length)];
    } else {
      selected = profs[Math.floor(Math.random() * profs.length)];
    }

    // contabiliza os períodos para o professor e retorna o id
    selected.allocated += periods;
    return selected.id;
  }
};
