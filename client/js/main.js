var courses, professores, started = false;

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

function ScheduleController($scope) {

  var socket = io.connect();

  $scope.messages = [];

  socket.on('connect', function () {
    //console.log('connect');
  });

  socket.on('courses', function (data) {
    //console.log(data);
    courses = data;
  });

  socket.on('professores', function (data) {
    //console.log(data);
    professores = data;
  });

  socket.on('notification', function (data) {
    //console.log(data);
    if (/started/.test(data)) {
      started = true;
      $('#sound')[0].play();
    }
  });

  socket.on('error', function (data) {
    //console.log(data);
    started = false;
    $('#sound')[0].pause();
    alert('Error: ' + data);
    $('#spinner').hide();
  });

  socket.on('data', function (data) {

    //console.log(data);

    if (data.generation === 0) {
      $('#content-description').hide();
      $('#results').show();
    }

    if (data.isFinished) {
      started = false;
      $('#sound')[0].pause();
      $('#spinner').hide();
      alert('Completed process!!!');
    }

    if (!data.solution) {
      $scope.messages[0].generation = data.generation;
      $scope.$apply();
      $('.gen' + $scope.messages[0].id).html($scope.messages[0].generation);
      return;
    }

    var list = [];
    Object.keys(data.solution).forEach(function(slot) {
      Object.keys(data.solution[slot]).forEach(function(course) {
        Object.keys(data.solution[slot][course]).forEach(function(semester) {
          var i = list.search('course', course, {
            course: course,
            semesters: []
          });
          var j = list[i].semesters.search('semester', semester, {
            semester: semester,
            schedule: {}
          });
          list[i].semesters[j].schedule[slot] = data.solution[slot][course][semester];
        });
      });
    });

    data.courses = [];

    list.sort(function (a, b) {
      if (a.course.length === b.course.length) {
        return a.course.split('.')[0].length > b.course.split('.')[0].length;
      } else {
        return a.course.length > b.course.length;
      }
    });

    var html = '';
      html += '<div class="modal fade" id="gv' + data.generation + '" tabindex="-1" role="dialog">';
      html += '  <div class="modal-dialog" role="document">';
      html += '    <div class="modal-content">';
      html += '      <div class="modal-header">';
      html += '        <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>';
      html += '        <h4 class="modal-title">';
      html += '          Generation: <span class="gen' + data.generation + '">' + data.generation + '</span> / Fitness: <span style="' + (data.fitness < 0 ? 'color: red' : '') + '">' + data.fitness + '</span>';
      html += '        </h4>';
      html += '      </div>';
      html += '      <div class="modal-body">';
      html += '<h5>Conflicts of shared disciplines (periods): ';
      html += '<span style="' + (data.metrics.shared_disicplines_no_ok > 0 ? 'color: red' : '') + '">' + data.metrics.shared_disicplines_no_ok + '</span>  of ' + data.metrics.shared_disicplines_total;
      html += '</h5>';
      html += '<div class="row">';
      html += '  <div class="col-md-6">';
      html += '    <h5>Labs in use (max = ' + data.metrics.labs_in_use.max() + '): </h5>';
      html += '    <table class="validation">';
      var a;
      for (var i = 0; i < 6; i++) {
        a = data.metrics.labs_in_use.slice(i * 5, (i + 1) * 5);
        html += '<tr>';
        for (var j = 0; j < 5; j++) {
          html += '<td>' + a[j] + '</td>';
        }
        html += '</tr>';
      }
      html += '    </table>';
      html += '  </div>';
      html += '  <div class="col-md-6">';
      html += '    <h5>Roms in use (max = ' + data.metrics.rooms_in_use.max() + '): </h5>';
      html += '    <table class="validation">';
      for (var i = 0; i < 6; i++) {
        a = data.metrics.rooms_in_use.slice(i * 5, (i + 1) * 5);
        html += '<tr>';
        for (var j = 0; j < 5; j++) {
          html += '<td>' + a[j] + '</td>';
        }
        html += '</tr>';
      }
      html += '    </table>';
      html += '  </div>';
      html += '</div>';
      html += '<h5>Profs in use: </h5>';
      Object.keys(data.metrics.profs_in_use).forEach(function(prof) {
        var pname = professores.list.filter(function(p) {
          return p.id == prof;
        })[0];
        if (pname) {
          pname = pname.professor;
        } else {
          pname = '-';
        }
        var pv = data.metrics.profs_in_use[prof];
        html += '<h5>' +  pname + (pv.max() > 1 ? ' (<span style="color: red">conflict</span>)' : '') + ':</h5>';
        html += '    <table class="validation">';
        var day_t = [];
        for (var i = 0, len = pv.length / 5; i < len; i++) {
          a = pv.slice(i * 5, (i + 1) * 5);
          html += '<tr>';
          for (var j = 0; j < 5; j++) {
            if (day_t[j]) {
              day_t[j] += a[j];
            } else {
              day_t[j] = a[j];
            }
            html += '<td style="' + (a[j] > 1 ? 'color: red' : '') + '">' + a[j] + '</td>';
          }
          html += '</tr>';
        }
        html += '<tr style="background-color: #f0f0f0">';
        for (var i = 0; i < day_t.length; i++) {
          html += '<td style="' + (day_t[i] > 2 ? 'color: orange' : '') + '">' + day_t[i] + '</td>';
        }
        html += '</tr>';
        html += '    </table>';
      });
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';

    list.forEach(function(course, i_c) {

      data.courses.push(course.course);

      html += '<div class="modal fade" id="g' + data.generation + 'c' + i_c + '" tabindex="-1" role="dialog">';
      html += '  <div class="modal-dialog modal-lg" role="document">';
      html += '    <div class="modal-content">';
      html += '      <div class="modal-header">';
      html += '        <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>';
      html += '        <h4 class="modal-title">Generation: <span class="gen' + data.generation + '">' + data.generation + '</span> / Fitness: <span style="' + (data.fitness < 0 ? 'color: red' : '') + '">' + data.fitness + '</span> (' + course.course + ')</h4>';
      html += '      </div>';
      html += '      <div class="modal-body">';
      html += '        <ul class="nav nav-tabs" role="tablist">';

      course.semesters.sort(function (a, b) {
        return a.semester.localeCompare(b.semester);
      });

      course.semesters.forEach(function(semester, i_s) {
        html += '        <li role="presentation" class="' + (i_s === 0 ? 'active' : '') + '"><a href="#g' + data.generation + 'c' + i_c + 's' + i_s + '" aria-controls="g' + data.generation + 'c' + i_c + 's' + i_s + '" role="tab" data-toggle="tab">' + semester.semester + '</a></li>';
      });

      html += '        </ul>';
      html += '        <div class="tab-content">';

      course.semesters.forEach(function(semester, i_s) {

        html += '<div role="tabpanel" class="tab-pane ' + (i_s === 0 ? 'active' : '') + '" id="g' + data.generation + 'c' + i_c + 's' + i_s + '">';
        html += '  <div class="course-container">';
        html += '    <div class="panel panel-primary">';
        html += '      <div class="panel-body">';
        html += '<table id="' + course.course + '-' +  semester.semester + '">';
        html += '  <thead>';
        html += '    <tr class="table-title">';
        html += '      <td class=""></td>';
        html += '      <td class="">Seg</td>';
        html += '      <td class="">Ter</td>';
        html += '      <td class="">Qua</td>';
        html += '      <td class="">Qui</td>';
        html += '      <td class="">Sex</td>';
        html += '    </tr>';
        html += '  </thead>';
        html += '  <tbody>';
        html += '    <tr>';
        html += '      <td class="time-day" colspan="6">Manha:</td>';
        html += '    </tr>';
        html += '    <tr class="h8">';
        html += '      <td class="h">08h</td>';
        html += '      <td class="seg">' + discipline('Seg-8', semester, course.course) + '</td>';
        html += '      <td class="ter">' + discipline('Ter-8', semester, course.course) + '</td>';
        html += '      <td class="qua">' + discipline('Qua-8', semester, course.course) + '</td>';
        html += '      <td class="qui">' + discipline('Qui-8', semester, course.course) + '</td>';
        html += '      <td class="sex">' + discipline('Sex-8', semester, course.course) + '</td>';
        html += '    </tr>';
        html += '    <tr class="h10">';
        html += '      <td class="h">10h</td>';
        html += '      <td class="seg">' + discipline('Seg-10', semester, course.course) + '</td>';
        html += '      <td class="ter">' + discipline('Ter-10', semester, course.course) + '</td>';
        html += '      <td class="qua">' + discipline('Qua-10', semester, course.course) + '</td>';
        html += '      <td class="qui">' + discipline('Qui-10', semester, course.course) + '</td>';
        html += '      <td class="sex">' + discipline('Sex-10', semester, course.course) + '</td>';
        html += '    </tr>';
        html += '    <tr>';
        html += '      <td class="time-day" colspan="6">Tarde:</td>';
        html += '    </tr>';
        html += '    <tr class="h13">';
        html += '      <td class="h">13h</td>';
        html += '      <td class="seg">' + discipline('Seg-13', semester, course.course) + '</td>';
        html += '      <td class="ter">' + discipline('Ter-13', semester, course.course) + '</td>';
        html += '      <td class="qua">' + discipline('Qua-13', semester, course.course) + '</td>';
        html += '      <td class="qui">' + discipline('Qui-13', semester, course.course) + '</td>';
        html += '      <td class="sex">' + discipline('Sex-13', semester, course.course) + '</td>';
        html += '    </tr>';
        html += '    <tr class="h15">';
        html += '      <td class="h">15h</td>';
        html += '      <td class="seg">' + discipline('Seg-15', semester, course.course) + '</td>';
        html += '      <td class="ter">' + discipline('Ter-15', semester, course.course)+ '</td>';
        html += '      <td class="qua">' + discipline('Qua-15', semester, course.course) + '</td>';
        html += '      <td class="qui">' + discipline('Qui-15', semester, course.course) + '</td>';
        html += '      <td class="sex">' + discipline('Sex-15', semester, course.course) + '</td>';
        html += '    </tr>';
        html += '    <tr>';
        html += '      <td class="time-day" colspan="6">Noite:</td>';
        html += '    </tr>';
        html += '    <tr class="h19">';
        html += '      <td class="h">19h</td>';
        html += '      <td class="seg">' + discipline('Seg-19', semester, course.course) + '</td>';
        html += '      <td class="ter">' + discipline('Ter-19', semester, course.course) + '</td>';
        html += '      <td class="qua">' + discipline('Qua-19', semester, course.course) + '</td>';
        html += '      <td class="qui">' + discipline('Qui-19', semester, course.course) + '</td>';
        html += '      <td class="sex">' + discipline('Sex-19', semester, course.course) + '</td>';
        html += '    </tr>';
        html += '    <tr class="h21">';
        html += '      <td class="h">21h</td>';
        html += '      <td class="seg">' + discipline('Seg-21', semester, course.course) + '</td>';
        html += '      <td class="ter">' + discipline('Ter-21', semester, course.course) + '</td>';
        html += '      <td class="qua">' + discipline('Qua-21', semester, course.course) + '</td>';
        html += '      <td class="qui">' + discipline('Qui-21', semester, course.course) + '</td>';
        html += '      <td class="sex">' + discipline('Sex-21', semester, course.course) + '</td>';
        html += '    </tr>';
        html += '  </tbody>';
        html += '</table>';
        html += '      </div>';
        html += '      <div class="panel-footer">';
        html += '        <h3 class="panel-title">' + semester.semester + '</h3>';
        html += '      </div>';
        html += '    </div>';
        html += '  </div>';
        html += '</div>';
      });

      html += '        </div>';
      html += '      </div>';
      html += '    </div>';
      html += '  </div>';
      html += '</div>';
    });

    data.id = data.generation;

    $('#solutions').append(html);
    $scope.messages.unshift(data);

    $scope.$apply();
  });

  $scope.send = function send() {

    if (started) {
      alert('Wait for the process ...');
      return;
    }

    //console.log('start');
    var cfg = {
      problem: {
        disciplines: '',
        professores: '',
        labs: parseInt($('#labs').val(), 10),
        time: [
          $('#time_08h').is(':checked'),
          $('#time_10h').is(':checked'),
          $('#time_13h').is(':checked'),
          $('#time_15h').is(':checked'),
          $('#time_19h').is(':checked'),
          $('#time_21h').is(':checked')
        ]
      },
      genetic: {
        iterations: parseInt($('#iterations').val(), 10),
        size: parseInt($('#size').val(), 10),
        crossover: parseFloat($('#crossover').val(), 10),
        mutation: parseFloat($('#mutation').val(), 10)
      }
    };
    if ($('#disciplines')[0].files[0] && $('#professores')[0].files[0]) {
      var reader_disciplines = new FileReader();
      reader_disciplines.onloadend = function() {
        cfg.problem.disciplines = this.result;
        var reader_professores = new FileReader();
        reader_professores.onloadend = function() {
          cfg.problem.professores = this.result;
          start(cfg);
        };
        reader_professores.readAsText($('#professores')[0].files[0]);
      };
      reader_disciplines.readAsText($('#disciplines')[0].files[0]);
    } else {
      alert('Error: Select files !!!');
    }
    function start(cfg) {
      $('#spinner').show();
      $scope.messages.splice(0, $scope.messages.length);
      $scope.$apply();
      $('#solutions').html('');
      socket.emit('start', cfg);
    }
  };
}

function discipline(slot, s, course) {
  if (s.schedule[slot]) {
    for (var i = 0; i < courses.list.length; i++) {
      for (var semester in courses.list[i].semesters) {
        var sn = s.semester;
        var sv = sn.indexOf('_');
        if (sv > 0) {
          sn = sn.slice(0, sv);
        }
        if (semester == sn) {
          for (var j = 0; j < courses.list[i].semesters[semester].length; j++) {
            if (courses.list[i].semesters[semester][j].id == s.schedule[slot].discipline_id) {
              var p = professores.list.filter(function(p) {
                return p.id == s.schedule[slot].professor_id;
              })[0];
              if (p) {
                p = p.professor;
              } else {
                p = '-';
              }
              var name = courses.list[i].semesters[semester][j].discipline;
              var html = '';
              html += '<span title="' + name + '">' + shortname(name) + '</span><br>';
              html += courses.list[i].semesters[semester][j].classes[s.schedule[slot].class_id].classname + '<br>';
              html += p + '<br>';
              html += s.schedule[slot].room;
              return html;
            }
          }
        }
      }
    }
  }
  return '';
}

function shortname(str) {
  var wds = str.split(/\s/);
  if (wds.length === 1 || wds.length === 2 && wds[1].length < 4) {
    return str;
  }
  var sht = '';
  var i = 0;
  if (wds[0].length < 4) {
    sht += wds[0] + '$';
    i = wds[0].length + 1;
  }
  for (var len = str.length; i < len; i++) {
    if (str[i] === str[i].toUpperCase()) {
      if (str[i] === ' '  && sht[ sht.length - 1] === ' ') {
        continue;
      }
      sht += str[i];
    }
  }
  sht = sht.replace(/\s/g, '. ');
  return sht.replace(/\$/g, ' ');
}

$(function() {
  $.material.init();
});
