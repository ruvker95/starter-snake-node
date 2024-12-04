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
  const board = gameData.board;
  const possibleMoves = ['up', 'down', 'left', 'right'];
  const possibleSnakeStates = ['angery', 'mad', 'hungry', 'baby', 'stinky'];
  const currentSnakeState = null;

  // Determine snake state, write functions for this
  // function determineState
  /**
   * if(state = 'hungry') {
   * 
   * function execute hungry strat() {
   * 
   * Determine moves, send to server
   * 
   * }
   * else if (state = 'sad') {
   * 
   *  }
   */

  // Determine the closest food
  let targetFood = null;
  for (const food of board.food) {
    if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
      targetFood = food;
    }
  }

  // Decide movement target
  let target = null;

  // 30% chance to follow another snake's tail
  if (Math.random() < 0.3 && board.snakes.length > 1) {
    // Choose a random snake (not itself)
    const otherSnakes = board.snakes.filter(snake => snake.id !== mySnake.id);
    if (otherSnakes.length > 0) {
      const randomSnake = otherSnakes[Math.floor(Math.random() * otherSnakes.length)];
      // Target the tail of the random snake
      target = randomSnake.body[randomSnake.body.length - 1];
    }
  }

  if (!target && targetFood) {
    target = targetFood; // Go for food
  }

  // If no target, move randomly
  if (!target) {
    // Default to a safe random move
    const safeMoves = getSafeMoves(board, mySnake, possibleMoves, myHead);
    if (safeMoves.length > 0) {
      const randomMove = safeMoves[Math.floor(Math.random() * safeMoves.length)];
      console.log('MOVE:', randomMove);
      response.status(200).send({ move: randomMove });
      return;
    } else {
      // No safe moves, pick any move that doesn't take us off board or hit ourselves
      for (const move of possibleMoves) {
        const nextCoord = moveAsCoord(move, myHead);
        if (!offBoard(board, nextCoord) && !snakeHitSelfQuestionMark(mySnake, nextCoord)) {
          response.status(200).send({ move: move });
          return;
        }
      }
      // As a last resort, default to 'up'
      response.status(200).send({ move: 'up' });
      return;
    }
  }

  // Get safe moves
  let safeMoves = getSafeMoves(board, mySnake, possibleMoves, myHead);

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
    // No safe moves towards target, move randomly among safe moves
    if (safeMoves.length > 0) {
      const randomMove = safeMoves[Math.floor(Math.random() * safeMoves.length)];
      console.log('MOVE:', randomMove);
      response.status(200).send({ move: randomMove });
    } else {
      // No safe moves, pick any move that doesn't take us off board or hit ourselves
      for (const move of possibleMoves) {
        const nextCoord = moveAsCoord(move, myHead);
        if (!offBoard(board, nextCoord) && !snakeHitSelfQuestionMark(mySnake, nextCoord)) {
          response.status(200).send({ move: move });
          return;
        }
      }
      // As a last resort, default to 'up'
      response.status(200).send({ move: 'up' });
    }
  }
}

/**
 * Get safe moves
 * @param {*} board 
 * @param {*} mySnake 
 * @param {*} possibleMoves 
 * @param {*} myHead 
 * @returns 
 */
function getSafeMoves(board, mySnake, possibleMoves, myHead) {
  let safeMoves = [];
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafe(board, mySnake, nextCoord)) {
      safeMoves.push(move);
    }
  }
  return safeMoves;
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
  /** Stop hitting yourself */
  if (snakeHitSelfQuestionMark(mySnake, coord)) {
    return false;
  }
  // Avoid other snakes
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }
  return true;
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
    if (coordEqual(coord, segment)) {
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
