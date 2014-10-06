/*
  Copyright 2014 Nebez Briefkani and Kollegorna

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

(function($, window, undefined) {

var config = {
  debug: false,
  volume: 30,
  gravity: 0.25,
  jump: -4.6,
  openingHeight: 100,
  openingWidth: 30,
};

var screens = {
  splash: 0,
  play: 1,
  score: 2,
};

var soundOptions = {
  // Firefox doesn't play sound if using Web Audio API :/
  webAudioApi: !window.navigator.userAgent.match(/Firefox/i),
  formats: ['ogg', 'mp3'],
};

var sounds = {
  jump: new buzz.sound('assets/sounds/sfx_wing', soundOptions),
  score: new buzz.sound('assets/sounds/sfx_point', soundOptions),
  hit: new buzz.sound('assets/sounds/sfx_hit', soundOptions),
  die: new buzz.sound('assets/sounds/sfx_die', soundOptions),
  swoosh: new buzz.sound('assets/sounds/sfx_swooshing', soundOptions),
};

var state = {
  current: screens.splash,
  velocity: 0,
  position: 180,
  rotation: 0,
  score: 0,
  highscore: 0,
};

// DOM elements.
var $game, $flyarea, $player, $splash, $scoreboard, $medal, $retry;

// Runtime stuff.
var gameInterval;
var pipeInterval;
var pipeNumber = 0;
var pipes = [];

$(function() {
  if (window.location.search === '?debug') config.debug = true;
  if (window.location.search === '?easy') config.openingHeight = 200;

  // Get DOM elements.
  $game = $('#game');
  $flyarea = $('#flyarea');
  $player = $('#player');
  $splash = $('#splash');
  $scoreboard = $('#scoreboard');
  $medal = $('#medal');
  $retry = $('#retry');

  // Set volume.
  buzz.all().setVolume(config.volume);

  // Get the highscore.
  // var savedScore = getCookie('highscore');
  // if (savedScore) state.highscore = parseInt(savedScore);

  // Handle space bar.
  $(window.document).on('keydown', function(e) {
    if (e.keyCode === 32) {
      // In scoreboard, hitting space should trigger the 'Retry' button.
      // Otherwise it's just a regular spacebar hit.
      if (state.screen === screens.score) {
        $retry.trigger('click');
      }
      else {
        screenClick();
      }
    }
  });

  // Handle mouse down and touch start events.
  $(window.document).on('mousedown touchstart', screenClick);

  // Start with the splash screen.
  showSplash();
});

function showSplash() {
  state.screen = screens.splash;

  // Reset the defaults.
  state.score = 0;
  state.position = 180;
  state.velocity = 0;
  state.rotation = 0;

  // Update the player in preparation for the next game.
  $player.css({ y: 0, x: 0});
  updatePlayer();

  // Clear out all the pipes if there are any.
  $('.pipe').remove();
  pipes = [];

  // Make everything animated again.
  $('.animated').css('animation-play-state', 'running');
  $('.animated').css('-webkit-animation-play-state', 'running');

  // Fade in the splash.
  $splash.transition({ opacity: 1 }, 2000, 'ease');
}

function startGame() {
  state.screen = screens.play;

  // Fade out the splash.
  $splash.stop();
  $splash.transition({ opacity: 0 }, 500, 'ease');

  // Update the big score.
  setBigScore();

  // If debug mode, show the bounding boxes.
  if (config.debug) {
    $('.boundingbox').show();
  }

  // Jump from the start!
  playerJump();
  updatePlayer();

  // Start up our loops.
  gameInterval = window.setInterval(gameLoop, 1000.0 / 60.0);
  pipeInterval = window.setInterval(updatePipes, 1400);
}

function screenClick() {
  if (state.screen === screens.play) {
    playerJump();
  }
  else if (state.screen === screens.splash) {
    startGame();
  }
}

function playerJump() {
  state.velocity = config.jump;
  playSound('jump');
}

function gameLoop() {
  // Update the player's speed/position.
  state.velocity += config.gravity;
  state.position += state.velocity;

  // Update the player.
  updatePlayer();

  // Create the player's bounding box.
  var player = $player[0].getBoundingClientRect();
  var origWidth = 50.0;
  var origHeight = 34.0;

  var playerWidth = origWidth - (Math.sin(Math.abs(state.rotation) / 90) * 8);
  var playerHeight = (origHeight + player.height) / 2;
  var playerLeft = ((player.width - playerWidth) / 2) + player.left;
  var playerTop = ((player.height - playerHeight) / 2) + player.top;
  var playerRight = playerLeft + playerWidth;
  var playerBottom = playerTop + playerHeight;

  // Did the player hit the ground?
  if (playerBottom >= $flyarea.height()) {
    playerDead();
    return;
  }

  // Prevent the player from escaping through the ceiling.
  if (playerTop <= 0) {
    state.position = 10;
  }

  // We can't do much more without any pipes.
  if (!pipes.length) return;

  // Calculate the next opening's position.
  var $upper = $('#pipe-' + pipes[0] + ' .pipe_upper');
  var openingTop = $upper.offset().top + $upper.height();
  var openingLeft = $upper.offset().left + 3;
  var openingBottom = openingTop + config.openingHeight;
  var openingRight = openingLeft + config.openingWidth;

  // If we're in debug mode, draw the bounding boxes.
  if (config.debug) {
    $('#playerbox').css({
      left: playerLeft,
      top: playerTop,
      height: playerHeight,
      width: playerWidth
    });
    $('#openingbox').css({
      left: openingLeft,
      top: openingTop,
      height: config.openingHeight,
      width: config.openingWidth
    });
  }

  // Is the player inside the next opening?
  if (playerRight > openingLeft) {
    if (playerTop > openingTop && playerBottom < openingBottom) {
      // The player is passing through the opening. Keep going.
    }
    else {
      // No! It touched the pipe.
      playerDead(true);
      return;
    }

    // Has the player passed through the pipe?
    if (playerLeft > openingRight) {
      oneUp();
      pipes.shift();
    }
  }
}

function updatePlayer() {
  // Change rotation and position.
  state.rotation = Math.min((state.velocity / 10) * 90, 90);
  $player.css({ rotate: state.rotation, top: state.position });
}

function updatePipes() {
  // Remove any old pipes that have moved out of screen.
  $('.pipe').filter(function() {
    return $(this).position().left <= -100;
  }).remove();

  // Add a new pipe to the list, incrementing the count.
  pipes.push(++pipeNumber);

  // Create DOM elements for the new pipe.
  var padding = 80;
  var constraint = 420 - config.openingHeight - (padding * 2); // Double padding (for top and bottom)
  var topHeight = Math.floor((Math.random() * constraint) + padding); // Add lower padding
  var bottomHeight = (420 - config.openingHeight) - topHeight;
  var $pipe = $('<div class="pipe animated" id="pipe-' + pipeNumber + '"><div class="pipe_upper" style="height: ' + topHeight + 'px;"></div><div class="pipe_lower" style="height: ' + bottomHeight + 'px;"></div></div>');

  // Add the pipe's DOM elements.
  $pipe.appendTo($flyarea);
}

function oneUp() {
  playSound('score');
  state.score++;
  setBigScore();
}

function playerDead(hit) {
  // Stop animating everything!
  $('.animated').css('animation-play-state', 'paused');
  $('.animated').css('-webkit-animation-play-state', 'paused');

  // Drop the player to the floor. We use width because he'll be rotated 90 deg.
  var playerBottom = $player.position().top + $player.width();
  var moveY = Math.max(0, $flyarea.height() - playerBottom);
  var easing = hit ? 'easeInBack' : 'ease';
  $player.transition({ y: moveY + 'px', rotate: 90}, 1000, easing);

  // Destroy the intervals.
  window.clearInterval(gameInterval);
  window.clearInterval(pipeInterval);
  gameInterval = null;
  pipeInterval = null;

  // Only play the "hit" sound if hitting a pipe, and not on mobile browsers as
  // they don't support buzz' bindOnce event.
  if (!hit || isIncompatible.any()) {
    playSound('die');
    showScore();
  }
  else {
    playSound('hit', function() {
      playSound('die', function() {
        showScore();
      });
    });
  }
}

function showScore() {
  state.screen = screens.score;

  playSound('swoosh');
  $scoreboard.show();

  // Has the highscore been beaten?
  if (state.score > state.highscore) {
    state.highscore = state.score;
    // setCookie('highscore', state.highscore, 999);
  }

  // Remove the big score.
  setBigScore(true);

  // Update the scoreboard.
  setCurrentScore();
  setHighScore();

  // Show the score.
  $medal.attr('class', '');
  $scoreboard.css({ y: '40px', opacity: 0 }); // Move it down so we can slide it up
  $retry.css({ y: '40px', opacity: 0 });
  $scoreboard.transition({ y: '0px', opacity: 1}, 600, 'ease', function() {
    // When the animation is done, animate in the retry button and SWOOSH!
    playSound('swoosh');
    $retry.transition({ y: '0px', opacity: 1}, 600, 'ease');

    // Set and animate in the medal.
    var medal = getMedal();
    $medal.attr('class', medal)
      .css({ scale: 2, opacity: 0 })
      .transition({ opacity: 1, scale: 1 }, 1200, 'ease');
  });

  // Allow player to retry.
  $retry.one('click', function() {
    playSound('swoosh');

    // Fade out the score.
    $scoreboard.transition({ y: '-40px', opacity: 0}, 1000, 'ease', function() {
      $scoreboard.fadeOut();
      showSplash();
    });
  });
}

function getMedal() {
  if (state.score < 10) {
    return 'none';
  }
  else if (state.score >= 40) {
    return 'platinum';
  }
  else if (state.score >= 30) {
    return 'gold';
  }
  else if (state.score >= 20) {
    return 'silver';
  }
  else if (state.score >= 10) {
    return 'bronze';
  }
}

function setBigScore(reset) {
  var $score = $('#bigscore');
  $score.empty();

  if (reset) return;

  var digits = state.score.toString().split('');
  for (var i = 0, len = digits.length; i < len; i++) {
    $score.append('<img src="assets/font_big_' + digits[i] + '.png" alt="' + digits[i] + '">');
  }
}

function setCurrentScore() {
  var $score = $('#currentscore');
  $score.empty();

  var digits = state.score.toString().split('');
  for (var i = 0, len = digits.length; i < len; i++) {
    $score.append('<img src="assets/font_small_' + digits[i] + '.png" alt="' + digits[i] + '">');
  }
}

function setHighScore() {
  var $score = $('#highscore');
  $score.empty();

  var digits = state.highscore.toString().split('');
  for (var i = 0, len = digits.length; i < len; i++) {
    $score.append('<img src="assets/font_small_' + digits[i] + '.png" alt="' + digits[i] + '">');
  }
}

function playSound(sound, callback) {
  var ref = sounds[sound].load().play();
  if (callback) {
    ref.bindOnce('ended', callback);
  }
}

var isIncompatible = {
  Android: function() {
    return window.navigator.userAgent.match(/Android/i);
  },
  BlackBerry: function() {
    return window.navigator.userAgent.match(/BlackBerry/i);
  },
  iOS: function() {
    return window.navigator.userAgent.match(/iPhone|iPad|iPod/i);
  },
  Opera: function() {
    return window.navigator.userAgent.match(/Opera Mini/i);
  },
  Safari: function() {
    return (window.navigator.userAgent.match(/OS X.*Safari/) && ! window.navigator.userAgent.match(/Chrome/));
  },
  Windows: function() {
    return window.navigator.userAgent.match(/IEMobile/i);
  },
  any: function() {
    return (isIncompatible.Android() || isIncompatible.BlackBerry() || isIncompatible.iOS() || isIncompatible.Opera() || isIncompatible.Safari() || isIncompatible.Windows());
  }
};

}(jQuery, this));
