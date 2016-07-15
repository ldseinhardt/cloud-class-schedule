#!/usr/bin/env node

/**
  * Bibliotecas
  */

var http = require('http');
var path = require('path');
var socketio = require('socket.io');
var express = require('express');
var cp = require('child_process');

/**
  * Configurações do servidor
  */

var router = express();
var server = http.createServer(router);
var io = socketio.listen(server);

router.use(express.static(path.resolve(__dirname, 'client')));

var users = [];

io.on('connection', function(socket) {
  
  var user = users.push({
    socket: socket
  }) - 1;
  
  socket.on('disconnect', function() { 
  
    var index = users.findIndex(function(user) {
      return user.socket === socket;
    });    
  
    if (index >= 0) {
      users[index].process && users[index].process.kill();
      users[index] = {};
    }
    
  });

  socket.on('start', function(settings) {

    users[user].process = cp.fork(path.resolve(__dirname, 'class-schedule.js'));

    users[user].process.on('message', function(message) {
      users[message.user].socket.emit(message.name, message.data);
    });
    
    users[user].process.send({
      user: user,
      settings: settings
    });
    
  });
  
});

server.listen(process.env.PORT || 8080, process.env.IP || '0.0.0.0', function() {
  
  var addr = server.address();
  
  console.log('Server listening at', addr.address + ':' + addr.port);
  
});
