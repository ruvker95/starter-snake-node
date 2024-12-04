const bodyParser = require('body-parser');
const express = require('express');
const PORT = process.env.PORT || 3000;
const app = express();
app.use(bodyParser.json());
app.get('/', handleIndex);
app.post('/start', handleStart);
app.post('/move', handleMove);
app.post('/end', handleEnd);
app.listen(PORT, () => console.log(`Battlesnake Server listening at http://127.0.0.1:${PORT}`));

function handleIndex(request, response) {
  const battlesnakeInfo = {
    apiversion: '1',
    author: 'ruvimandaddision',
    color: '#660033', // Dark red - #660033
    head: 'workout',     // workout
    tail: 'sharp'    // sharp
  };
  response.status(200).json(battlesnakeInfo);
}

/**
 * 
 * @param {*} request 
 * @param {*} response 
 */
function handleStart(request, response) {
  console.log('START');
  response.status(200).send('ok');
}

/**
 * do the thing
 * @param {*} request 
 * @param {*} response 
 * @returns 
 */
function handleMove(request, response) {
  /** Optional: Have different states the snake will go into based
   * on current server situation.
   * Example: "scared", "hungry", and "wimpy".
   * 
   */
  const gameData = request.body;
  const mySnake = gameData.you;
  const myHead = mySnake.head;
  const myLength = mySnake.length;
  const myHealth = mySnake.health;
  const board = gameData.board;
  const possibleMoves = ['up', 'down', 'left', 'right'];
  const possibleSnakeStates = ['aggressive', 'hungry', 'random'];
  let currentSnakeState = null;

  // Determine snake state based on health
  if (myHealth < 50) {
    currentSnakeState = 'hungry';
  } else {
    // Introduce randomness
    const randomValue = Math.random();
    if (randomValue < 0.33) {
      currentSnakeState = 'aggressive';
    } else if (randomValue < 0.66) {
      currentSnakeState = 'random';
    } else {
      currentSnakeState = 'hungry';
    }
  }

  let target = null;

  // Execute strategy based on current state
  if (currentSnakeState === 'hungry') {
    // Go after food to stay alive
    let targetFood = null;
    for (const food of board.food) {
      if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
        targetFood = food;
      }
    }
    target = targetFood;
  } else if (currentSnakeState === 'aggressive') {
    // Target other snakes aggressively
    let targetSnake = null;
    for (const snake of board.snakes) {
      if (snake.id !== mySnake.id && snake.length < myLength) {
        if (!targetSnake || distance(myHead, snake.head) < distance(myHead, targetSnake.head)) {
          targetSnake = snake;
        }
      }
    }
    if (targetSnake) {
      target = targetSnake.head;
    } else {
      // If no smaller snake, go after food
      let targetFood = null;
      for (const food of board.food) {
        if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
          targetFood = food;
        }
      }
      target = targetFood;
    }
  } else if (currentSnakeState === 'random') {
    // Random behavior: sometimes follow other snakes' tails
    if (Math.random() < 0.5 && board.snakes.length > 1) {
      // Choose a random other snake to follow
      let otherSnakes = board.snakes.filter(snake => snake.id !== mySnake.id);
      let randomSnake = otherSnakes[Math.floor(Math.random() * otherSnakes.length)];
      target = randomSnake.body[randomSnake.body.length - 1]; // Tail segment
    } else {
      // Go after the closest food
      let targetFood = null;
      for (const food of board.food) {
        if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
          targetFood = food;
        }
      }
      target = targetFood;
    }
  }

  // If no target, default to safe move
  if (!target) {
    // Default to a safe move if no target
    for(const move of possibleMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      if(!offBoard(board, nextCoord) && isSafe(board, mySnake, nextCoord)) {
        response.status(200).send({ move: move });
        return;
      }
    }
  }

  // Get safe moves
  let safeMoves = [];
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafe(board, mySnake, nextCoord)) {
      safeMoves.push(move);
    }
  }

  // Choose the best move towards the target
  let bestMove = null;
  let shortestDistance = Infinity;
  for (const move of safeMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    const dist = distance(nextCoord, target);
    if (dist < shortestDistance) {
      shortestDistance = dist;
      bestMove = move;
    }
  }

  if (bestMove) {
    console.log('MOVE:', bestMove);
    response.status(200).send({ move: bestMove });
  } else {
    // If no safe moves, default to any move that doesn't take us off the board or hit ourselves
    console.log('No best move found, defaulting to safe move.');
    for (const move of possibleMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      if(!offBoard(board, nextCoord) && !snakeHitSelfQuestionMark(mySnake, nextCoord)) {
        response.status(200).send({ move: move });
        return;
      }
    }
    // As a last resort, default to 'up'
    response.status(200).send({ move: 'up' });
  }
}

/**
 * Predetermine where this move will take us (i.e., the coordinates after the move has been applied)
 * @param {*} move the move we are checking
 * @param {*} head head of the snake 
 * @returns 
 */
function moveAsCoord(move, head) {
  switch (move) {
    case 'up': return { x: head.x, y: head.y + 1 };
    case 'down': return { x: head.x, y: head.y - 1 };
    case 'left': return { x: head.x - 1, y: head.y };
    case 'right': return { x: head.x + 1, y: head.y };
  }
}

/**
 * 
 * @param {*} board 
 * @param {*} coord 
 * @returns 
 */
function offBoard(board, coord) {
  return coord.x < 0 || coord.y < 0 || coord.x >= board.width || coord.y >= board.height;
}

/**
 * Determine whether the move is safe
 * @param {} board 
 * @param {*} mySnake 
 * @param {*} coord 
 * @returns 
 */
function isSafe(board, mySnake, coord) {
  // Avoid walls
  if (offBoard(board, coord)) {
    return false;
  } 
  // Avoid self
  if(snakeHitSelfQuestionMark(mySnake, coord)) {
    return false;
  }
  // Avoid other snakes' bodies
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }
  // Avoid collisions with other snakes' heads
  for (const snake of board.snakes) {
    if (snake.id !== mySnake.id) {
      const theirNextCoords = getAdjacentCoords(snake.head);
      for (const nextCoord of theirNextCoords) {
        if (coordEqual(coord, nextCoord)) return false;
      }
    }
  }
  return true;
}

/**
 * Get adjacent coordinates (possible next moves) from a given coordinate
 * @param {*} coord 
 * @returns 
 */
function getAdjacentCoords(coord) {
  return [
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x + 1, y: coord.y },
  ];
}

/**
 * Checks whether two coordinates are equal
 * @param {Number} a 
 * @param {Number} b 
 * @returns boolean
 */
function coordEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

/**
 * Calculates the Manhattan distance between two points
 * @param {*} a 
 * @param {*} b 
 * @returns 
 */
function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Does the snake hit itself? If it does, don't
 */
function snakeHitSelfQuestionMark(mySnake, coord) {
  // Avoid self
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment))  {
      return true;
    }
  }
  return false;
}

/**
 * 
 * @param {*} request 
 * @param {*} response 
 */
function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}
