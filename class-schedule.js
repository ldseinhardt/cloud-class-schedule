/**
  * Bibliotecas
  */

var cc = require('./cc');
var geneticjs = require('genetic-js');

/**
  * Definições do algoritmo genético
  */

var genetic = geneticjs.create();
genetic.optimize = geneticjs.Optimize.Maximize;
genetic.select1 = geneticjs.Select1.Tournament2;
genetic.select2 = geneticjs.Select2.Tournament2;

process.on('message', function(message) {
  message.settings.genetic.maxResults = 1;
  var p_cfg = {
    user: message.user,
    slots: [],
    slots_total: cc.SLOTS_TOTAL,
    // lista de cursos, semestres, disciplinas ...
    courses: cc.courses(message.settings.problem.disciplines),
    // lista de professores
    professores: cc.professores(message.settings.problem.professores),
    MAX_LABS: message.settings.problem.labs
  };
  for (var i = 0, len = cc.SLOTS.length; i < len; i++) {
    if (message.settings.problem.time[i]) {
      p_cfg.slots = p_cfg.slots.concat(cc.SLOTS[i]);
    }
  }
  if ((p_cfg.courses.periods - p_cfg.professores.periods) > 0) {
    process.send({
      user: message.user,
      name: 'error',
      data: 'Não há professores o suficiente !!!'
    });
  } else if (!cc.match(p_cfg.courses.list, p_cfg.professores.list)) {
    process.send({
      user: message.user,
      name: 'error',
      data: 'Faltou professores !!!'
    });
  } else {
    process.send({
      user: message.user,
      name: 'notification',
      data: 'started'
    });
    process.send({
      user: message.user,
      name: 'courses',
      data: p_cfg.courses
    });
    process.send({
      user: message.user,
      name: 'professores',
      data: p_cfg.professores
    });
    // paramêtros para iniciar o algoritmo genético
    genetic.evolve(message.settings.genetic, p_cfg);
  }
});

// cria individuos
genetic.seed = function() {
  var slots = this.userData['slots'];
  var slots_total = this.userData['slots_total'];
  var courses = this.userData['courses'];

  // inícia a estrutura de grade
  var grid = {};
  slots_total.forEach(function(slot) {
    grid[slot] = {};
    courses.list.forEach(function(course) {
      grid[slot][course.course] = {};
    });
  });

  // aloca disciplinas fixas
  courses.list.forEach(function(course) {
    for (var semester in course.semesters) {
      // aloca disciplinas fixas
      course.semesters[semester].forEach(function(discipline) {
        discipline.classes.forEach(function(cls, i_cls) {
          if (cls.schedule.length) {
            for (var i = 0; i < cls.periods; i++) {
              // insere a disciplina / turma na grade
              grid[cls.schedule[i]][course.course][semester] = {
                discipline_id: discipline.id, // id da disciplina
                class_id: i_cls, // id da turma (posição na lista)
                professor_id: cls.professor, // id do professor
                period: (i + 1), // período (primeiro, segundo, ... ??)
                lab: (cls.lab) !== 0 && ((cls.lab == cls.periods) || ((cls.lab == cls.periods/2) && (i === 0))), // necessário usar lab
                room: '', // campo para inserir o nome da sala posteriormente
                fixed: true, // disciplina fixada (não será deslocada)
                requirement: cls.requirement, // pré-requisito
                shared: null,
                shared_ignored: false
              };
            }
          }
        });
      });
    }
  });

  // aloca as outras disciplinas aleatóriamente
  courses.list.forEach(function(course) {
    for (var semester in course.semesters) {
      course.semesters[semester].forEach(function(discipline) {
        discipline.classes.forEach(function(cls, i_cls) {
          if (!cls.schedule.length) {

            var s_names = [semester];

            if (i_cls > 0) {

              s_names[0] = semester + '_1';

              var shared = discipline.classes.filter(function(cls) {
                return cls.shared.length > 0;
              });

              if (shared.length) {
                var shared_list = {};

                shared.forEach(function(cls) {
                  cls.shared.forEach(function(c) {
                    if (!shared_list[c]) {
                      shared_list[c] = 0;
                    }
                    shared_list[c]++;
                  });
                });

                for (var c in shared_list) {
                  if (shared_list[c] > 1) {
                    s_names.push(semester + '_1');
                  } else {
                    s_names.push(semester);
                  }
                }
              }
            }

            for (var i = 0; i < cls.periods; i++) {
              var cs = [].concat(course.course, cls.shared);
              var slot = random();
              var empty = true;
              for (var z = 0; z < cs.length; z++) {
                if (grid[slot][cs[z]][s_names[z] ? s_names[z] : s_names[0]]) {
                  empty = false;
                  break;
                }
              }
              if (!empty) {
                for (var g = 0; g < slots.length; g++) {
                  slot = slots[g];
                  empty = true;
                  for (var z = 0; z < cs.length; z++) {
                    if (grid[slot][cs[z]][s_names[z] ? s_names[z] : s_names[0]]) {
                      empty = false;
                      break;
                    }
                  }
                  if (empty) {
                    break;
                  }
                }
              }
              cs.forEach(function(cn, i_cn) {
                grid[slot][cn][s_names[i_cn] ? s_names[i_cn] : s_names[0]] = {
                  discipline_id: discipline.id, // id da disciplina
                  class_id: i_cls, // id da turma (posição na lista)
                  professor_id: cls.professor, // id do professor
                  period: (i + 1), // período (primeiro, segundo, ... ??)
                  lab: (cls.lab) !== 0 && ((cls.lab == cls.periods) || ((cls.lab == cls.periods/2) && (i === 0))), // necessário usar lab
                  room: '', // campo para inserir o nome da sala posteriormente
                  fixed: false, // disciplina não fixada
                  requirement: cls.requirement, // pré-requisito
                  shared: (cs.length > 1 && !i_cn ? {
                    course: cs.last(),
                    semester: s_names.last()
                  }  : null),
                  shared_ignored: (i_cn > 0)
                };
              });
            }
          }
        });
      });
    }
  });

  return grid;

  // função para gerar um horário aleatório
  function random() {
    return slots[Math.floor(Math.random() * slots.length)];
  }
};

// mutação (modifica um individuo)
genetic.mutate = function(entity) {
  var slots = this.userData['slots'];

  // pega 2 horários aleatório e tenta trocalos de lugar
  var s_course, s_semester, temp;

  Object.keys(entity).forEach(function(slot) {
    Object.keys(entity[slot]).forEach(function(course) {
      Object.keys(entity[slot][course]).forEach(function(semester) {
        var a = random(), b = random();
        if (entity[a][course][semester] &&
           !entity[a][course][semester].fixed &&
           !entity[a][course][semester].shared_ignored &&
            entity[b][course][semester] &&
           !entity[b][course][semester].fixed &&
           !entity[b][course][semester].shared_ignored) { // a & b

          if (entity[a][course][semester].shared || entity[b][course][semester].shared) {
            if (entity[a][course][semester].shared && !entity[b][course][semester].shared) { // a shared

              s_course = entity[a][course][semester].shared.course;
              s_semester = entity[a][course][semester].shared.semester;

              if (!entity[b][s_course][s_semester]) {
                temp = entity[a][course][semester];
                entity[a][course][semester] = entity[b][course][semester];
                entity[b][course][semester] = temp;

                temp = entity[a][s_course][s_semester];
                entity[a][s_course][s_semester] = entity[b][s_course][s_semester];
                entity[b][s_course][s_semester] = temp;
              }

            } else if (!entity[a][course][semester].shared && entity[b][course][semester].shared) { // b shared

              s_course = entity[b][course][semester].shared.course;
              s_semester = entity[b][course][semester].shared.semester;

              if (!entity[a][s_course][s_semester]) {
                temp = entity[a][course][semester];
                entity[a][course][semester] = entity[b][course][semester];
                entity[b][course][semester] = temp;

                temp = entity[a][s_course][s_semester];
                entity[a][s_course][s_semester] = entity[b][s_course][s_semester];
                entity[b][s_course][s_semester] = temp;
              }

            }
          } else {
            temp = entity[a][course][semester];
            entity[a][course][semester] = entity[b][course][semester];
            entity[b][course][semester] = temp;
          }
        } else if (entity[a][course][semester] &&
                  !entity[b][course][semester] &&
                  !entity[a][course][semester].fixed &&
                  !entity[a][course][semester].shared_ignored) { // a

          if (entity[a][course][semester].shared) { // move shareds not ignored
            s_course = entity[a][course][semester].shared.course;
            s_semester = entity[a][course][semester].shared.semester;
            if (!entity[b][s_course][s_semester]) {
              entity[b][course][semester] = entity[a][course][semester];
              delete entity[a][course][semester];
              entity[b][s_course][s_semester] = entity[a][s_course][s_semester];
              delete entity[a][s_course][s_semester];
            }
          } else {
            entity[b][course][semester] = entity[a][course][semester];
            delete entity[a][course][semester];
          }

        } else if (!entity[a][course][semester] &&
                    entity[b][course][semester] &&
                   !entity[b][course][semester].fixed &&
                   !entity[b][course][semester].shared_ignored) { // b

          if (entity[b][course][semester].shared) { // move shareds not ignored
            s_course = entity[b][course][semester].shared.course;
            s_semester = entity[b][course][semester].shared.semester;
            if (!entity[a][s_course][s_semester]) {
              entity[a][course][semester] = entity[b][course][semester];
              delete entity[b][course][semester];
              entity[a][s_course][s_semester] = entity[b][s_course][s_semester];
              delete entity[b][s_course][s_semester];
            }
          } else {
            entity[a][course][semester] = entity[b][course][semester];
            delete entity[b][course][semester];
          }

        }
      });
    });
  });

  return entity;

  // função para gerar um horário aleatório
  function random() {
    return slots[Math.floor(Math.random() * slots.length)];
  }
};

// cruza de 2 individuo (gerá 2 novos individuos - filho e filha)
// pega parte dos horários do pai e mãe e combina
genetic.crossover = function(mother, father) {
  var slots = this.userData['slots'];
  var slots_total = this.userData['slots_total'];
  var courses = this.userData['courses'];

  // inícia a estrutura de grade
  var son = {};
  slots_total.forEach(function(slot) {
    son[slot] = {};
    courses.list.forEach(function(course) {
      son[slot][course.course] = {};
    });
  });
  var daughter = JSON.parse(JSON.stringify(son));

  var value, i, daughter_list = [], son_list = [];

  // pega parte dos horários da mãe e pai
  Object.keys(mother).forEach(function(slot) {
    Object.keys(mother[slot]).forEach(function(course) {
      Object.keys(mother[slot][course]).forEach(function(semester) {
        // pega parte dos horários da mãe
        value = mother[slot][course][semester];
        if (value) {
          if (value.fixed) {
            son[slot][course][semester] = value;
            daughter[slot][course][semester] = value;
          } else if (!value.shared_ignored) {
            if (Math.floor(Math.random() * 2) == 0) {
              daughter_list.push({
                slot: slot,
                course: course,
                semester: semester,
                value: value
              });
            }
            if (Math.floor(Math.random() * 2) == 1) {
              son_list.push({
                slot: slot,
                course: course,
                semester: semester,
                value: value
              });
            }
          }
        }
      });
    });
  });

  // pega parte dos horários da mãe e pai
  Object.keys(father).forEach(function(slot) {
    Object.keys(father[slot]).forEach(function(course) {
      Object.keys(father[slot][course]).forEach(function(semester) {
        // pega parte dos horários do pai
        value = father[slot][course][semester];
        if (value && !value.fixed && !value.shared_ignored) {
          i = daughter_list.findIndex(function(e) {
            for (var key in e.value) {
              if (key !== 'shared' && e.value[key] != value[key]) {
                return false;
              }
            }
            return true;
          });
          if (i < 0) {
            daughter_list.push({
              slot: slot,
              course: course,
              semester: semester,
              value: value
            });
          }
          i = son_list.findIndex(function(e) {
            for (var key in e.value) {
              if (key !== 'shared' && e.value[key] != value[key]) {
                return false;
              }
            }
            return true;
          });
          if (i < 0) {
            son_list.unshift({
              slot: slot,
              course: course,
              semester: semester,
              value: value
            });
          }
        }
      });
    });
  });

  var x_slot, vs;

  // insere as disciplinas na grade filho (shareds)
  son_list.forEach(function(e) {
    if (e.value.shared) {
      vs = JSON.parse(JSON.stringify(e.value));
      vs.shared = null;
      vs.shared_ignored = true;
      if (!son[e.slot][e.course][e.semester] && !son[e.slot][e.value.shared.course][e.value.shared.semester]) {
        son[e.slot][e.course][e.semester] = e.value;
        son[e.slot][e.value.shared.course][e.value.shared.semester] = vs;
      } else {
        x_slot = random();
        if (son[x_slot][e.course][e.semester] || son[x_slot][e.value.shared.course][e.value.shared.semester]) {
          for (var g = 0; g < slots.length; g++) {
            x_slot = slots[g];
            if (!son[x_slot][e.course][e.semester] && !son[x_slot][e.value.shared.course][e.value.shared.semester]) {
              break;
            }
          }
        }
        son[x_slot][e.course][e.semester] = e.value;
        son[x_slot][e.value.shared.course][e.value.shared.semester] = vs;
      }
    }
  });

  // insere as disciplinas na grade filha (shareds)
  daughter_list.forEach(function(e) {
    if (e.value.shared) {
      vs = JSON.parse(JSON.stringify(e.value));
      vs.shared = null;
      vs.shared_ignored = true;
      if (!daughter[e.slot][e.course][e.semester] && !daughter[e.slot][e.value.shared.course][e.value.shared.semester]) {
        daughter[e.slot][e.course][e.semester] = e.value;
        daughter[e.slot][e.value.shared.course][e.value.shared.semester] = vs;
      } else {
        x_slot = random();
        if (daughter[x_slot][e.course][e.semester] || daughter[x_slot][e.value.shared.course][e.value.shared.semester]) {
          for (var g = 0; g < slots.length; g++) {
            x_slot = slots[g];
            if (!daughter[x_slot][e.course][e.semester] && !daughter[x_slot][e.value.shared.course][e.value.shared.semester]) {
              break;
            }
          }
        }
        daughter[x_slot][e.course][e.semester] = e.value;
        daughter[x_slot][e.value.shared.course][e.value.shared.semester] = vs;
      }
    }
  });

  // insere as disciplinas na grade filho
  son_list.forEach(function(e) {
    if (!e.value.shared) {
      if (!son[e.slot][e.course][e.semester]) {
        son[e.slot][e.course][e.semester] = e.value;
      } else {
        x_slot = random();
        if (son[x_slot][e.course][e.semester]) {
          for (var g = 0; g < slots.length; g++) {
            x_slot = slots[g];
            if (!son[x_slot][e.course][e.semester]) {
              break;
            }
          }
        }
        son[x_slot][e.course][e.semester] = e.value;
      }
    }
  });

  // insere as disciplinas na grade filha
  daughter_list.forEach(function(e) {
    if (!e.value.shared) {
      if (!daughter[e.slot][e.course][e.semester]) {
        daughter[e.slot][e.course][e.semester] = e.value;
      } else {
        x_slot = random();
        if (daughter[x_slot][e.course][e.semester]) {
          for (var g = 0; g < slots.length; g++) {
            x_slot = slots[g];
            if (!daughter[x_slot][e.course][e.semester]) {
              break;
            }
          }
        }
        daughter[x_slot][e.course][e.semester] = e.value;
      }
    }
  });

  return [son, daughter];

  // função para gerar um horário aleatório
  function random() {
    return slots[Math.floor(Math.random() * slots.length)];
  }
};

// calcula o quanto um individuo é saldavél e prospero para as gerações futuras
genetic.fitness = function(entity) {
  var slots = this.userData['slots'];
  var MAX_LABS = this.userData['MAX_LABS'];
  var met = this.metrics(entity);
  var fitness = 0;

  // pontua disciplinas compartilhadas que não estão ocorrendo ao mesmo tempo
  // já deve estar garantido
  // teste para verificar se a regra não esta sendo cumprida
  //////////////////////////////////////////////////////////////////////////////
  //if (met.shared_disicplines_total !== 64 || met.shared_disicplines_no_ok) {
    //console.log(met.shared_disicplines_total, met.shared_disicplines_no_ok);
    //process.exit();
  //}
  //////////////////////////////////////////////////////////////////////////////
  //fitness -= met.shared_disicplines_no_ok * 10000;

  // pontua o uso de labs
  // se usar mais que o necessário pontua negativo
  if (met.labs_in_use.max() > MAX_LABS) {
    fitness -= 1000 * (met.labs_in_use.max() - MAX_LABS);
  }

  for (var key in met.profs_in_use) {
    // verifica horários de professores em 2 locais ao mesmo tempo
    if (met.profs_in_use[key].max() > 1) {
      fitness -= 1000 * (met.profs_in_use[key].max() - 1);
    }
    // verifica se os professores estão sobre-carregados em um dia
    var pd = [];
    for (var i = 0; i < 5; i++) {
      pd[i] = 0;
      for (var j = 0, len = (slots.length / 5); j < len; j++) {
        if (met.profs_in_use[key][(j * 5) + i] != 0) {
          pd[i]++;
        }
        fitness += 1 / (pd[i] + 1);
      }
    }
    fitness += 42 / pd.max();
  }

  // verifica o número máximo de salas necessárias
  // quanto menos salas melhor
  fitness += 100 / met.rooms_in_use.max();

  return fitness;
};

// envia para o cliente notificações com a melhor solução até então
genetic.notification = function(pop, generation, stats, isFinished) {
  var user = this.userData['user'];
  var data = {
    generation: generation,
    fitness: parseFloat(pop[0].fitness.toPrecision(5), 10),
    isFinished: isFinished
  };
  if (!generation || data.fitness > this.last) {
    data.solution = this.rooms(pop[0].entity);
    data.metrics = this.metrics(data.solution);
  }
  this.last = data.fitness;
  process.send({
    user: user,
    name: 'data',
    data: data
  });
};

// define o nome das salas utilizadas
genetic.rooms = function(entity) {
  Object.keys(entity).forEach(function(slot) {
    var i_lab = 0, i_room = 0;
    Object.keys(entity[slot]).forEach(function(course) {
      Object.keys(entity[slot][course]).forEach(function(semester) {
        var value = entity[slot][course][semester];
        if (!value.shared_ignored) {
          value.room = value.lab
            ? 'LAB ' + (++i_lab)
            : 'SALA ' + (++i_room);
          if (value.shared) {
            entity[slot][value.shared.course][value.shared.semester].room = value.lab
              ? 'LAB ' + i_lab
              : 'SALA ' + i_room;
          }
        }
      });
    });
  });
  return entity;
};

// obtem métricas de uma solução
genetic.metrics =  function(entity) {
  var slots = this.userData['slots'];
  var slots_total = this.userData['slots_total'];
  var data = {
    profs_in_use: {},
    labs_in_use: [],
    rooms_in_use: [],
    shared_disicplines_total: 0,
    shared_disicplines_no_ok: 0
  };
  for (var i = 0, len = slots_total.length; i < len; i++) {
    data.labs_in_use[i] = 0;
    data.rooms_in_use[i] = 0;
  }
  Object.keys(entity).forEach(function(slot) {
    Object.keys(entity[slot]).forEach(function(course) {
      Object.keys(entity[slot][course]).forEach(function(semester) {
        var value = entity[slot][course][semester];
        if (value) {
          if (value.shared) {
            data.shared_disicplines_total++;
            var other = entity[slot][value.shared.course][value.shared.semester];
            if (other) {
              var equal = true;
              Object.keys(value).forEach(function(key) {
                if (['shared', 'shared_ignored'].indexOf(key) < 0) {
                  if (value[key] != other[key]) {
                    equal = false;
                  }
                }
              });
              if (!equal) {
                data.shared_disicplines_no_ok++;
              }
            } else {
              data.shared_disicplines_no_ok++;
            }
          } else {
            var pos = slots_total.indexOf(slot);
            if (value.professor_id > 0) {
              if (!data.profs_in_use[value.professor_id]) {
                data.profs_in_use[value.professor_id] = [];
                for (var i = 0, len = slots.length; i < len; i++) {
                  data.profs_in_use[value.professor_id][i] = 0;
                }
              }
              data.profs_in_use[value.professor_id][pos]++;
            }
            if (value.lab) {
              data.labs_in_use[pos]++;
            } else {
              data.rooms_in_use[pos]++;
            }
          }
        }
      });
    });
  });
  return data;
};
