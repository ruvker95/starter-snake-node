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
    color: '#F6DCBD', // Dark red
    head: 'sand-worm',     // Aggressive head
    tail: 'fat-rattle'    // Funny tail
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
  /** Optional: Have different states the snack will go into based
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
  const currentSnakeState= null;

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

  // Determine the closest smaller snake
  let targetSnake = null;
  for (const snake of board.snakes) {
    console.log("Checking snake" + snake.id)
    if (snake.id !== mySnake.id && snake.length < myLength) {
      if (!targetSnake || distance(myHead, snake.head) < distance(myHead, targetSnake.head)) {
        targetSnake = snake;
      }
    }
  }

  // Determine the closest food
  let targetFood = null;
  for (const food of board.food) {
    if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
      targetFood = food;
    }
  }
  // Decide movement target
  let target = null;
  if (targetSnake) {
    target = targetSnake.head; // Attack smaller snake
  } else if (targetFood) {
    target = targetFood; // Go for food
  }
  if (!target) {
    // Default to a safe move if no target
    /** Add check here to make sure you stay on board */
    for(const egg of possibleMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      if(!offBoard(board, nextCoord)) {
        /** Doesn't take snake off board, does this move cause our snake to run into itself? */
        if(snakeHitSelfQuestionMark(mySnake, nextCoord)) {
          // Do nothing
        }
        else {
          response.status(200).send({ move: egg });
          return;
        }
      }
    }
  }

  // Check if we are next to food and the enemy snake is close by or next to food also or bigger than my snake
  if (isNextToFood(myHead, targetFood) && (isEnemySnakeClose(mySnake, board.snakes) || isEnemySnakeNextToFood(mySnake, board.snakes) || isEnemySnakeBigger(mySnake, board.snakes))) {
    // Leave the spot and go to the next closest food
    targetFood = getClosestFood(myHead, board.food);
  }

  // Choose the best move towards the target
  let bestMove = null;
  let shortestDistance = Infinity;
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (!isSafe(board, mySnake, nextCoord)) continue;
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
    /** If we determine there are no safe moves, we still don't want to go off board, so add some checks here */
    console.log('No best move found, still need to make a move that does not take us off map');
    for(const secondBestMove of possibleMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      if(!offBoard(board, nextCoord)) {
        /** Doesn't take snake off board, does this move cause our snake to run into itself? */
        if(snakeHitSelfQuestionMark(mySnake, nextCoord)) {
          // Do nothing
        }
        else {
          response.status(200).send({ move: secondBestMove });
          return;
        }
      }
    }
  }
}

/**
 * Predetermine where this move will take is (ie the coordinates after the move as been applied)
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
 * Determine whether junk is safe
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
  /** stop hitting urself */
  if(snakeHitSelfQuestionMark(mySnake, coord)) {
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
 * Finds the 
 * @param {*} a 
 * @param {*} b 
 * @returns dum
 */
function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Does the snek hit itself? if it does, don't
 */
function snakeHitSelfQuestionMark(mySnake, coord) {
    // Avoid self
    for (const segment of mySnake.body) {
      if (coordEqual(coord, segment))  {
        return true;
    }
    return false;
  }
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

// Helper functions
function isNextToFood(head, food) {
  return Math.abs(head.x - food.x) <= 1 && Math.abs(head.y - food.y) <= 1;
}

function isEnemySnakeClose(mySnake, snakes) {
  for (const snake of snakes) {
    if (snake.id !== mySnake.id && distance(mySnake.head, snake.head) <= 2) {
      return true;
    }
  }
  return false;
}

function isEnemySnakeNextToFood(mySnake, snakes) {
  for (const snake of snakes) {
    if (snake.id !== mySnake.id && isNextToFood(snake.head, targetFood)) {
      return true;
    }
  }
  return false;
}

function isEnemySnakeBigger(mySnake, snakes) {
  for (const snake of snakes) {
    if (snake.id !== mySnake.id && snake.length > mySnake.length) {
      return true;
    }
  }
  return false;
}

function getClosestFood(head, foods) {
  let closestFood = null;
  let shortestDistance = Infinity;
  for (const food of foods) {
    const dist = distance(head, food);
    if (dist < shortestDistance) {
      shortestDistance = dist;
      closestFood = food;
    }
  }
  return closestFood;
}