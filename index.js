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
  const possibleSnakeStates = ['angry', 'mad', 'hungry', 'baby', 'stinky'];
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

  // Determine the closest smaller snake
  let targetSnake = null;
  for (const snake of board.snakes) {
    console.log("Checking snake " + snake.id);
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

  // Check if any other snake is closer to the targetFood
  let isFoodContested = false;
  if (targetFood) {
    for (const snake of board.snakes) {
      if (snake.id !== mySnake.id) {
        const theirDistance = distance(snake.head, targetFood);
        const myDistance = distance(myHead, targetFood);
        if (theirDistance <= myDistance) {
          // Another snake is as close or closer to the target food
          isFoodContested = true;
          break;
        }
      }
    }
  }

  if (isFoodContested) {
    // Avoid that food, go for next closest food
    let nextClosestFood = null;
    for (const food of board.food) {
      if (!coordEqual(food, targetFood)) {
        if (!nextClosestFood || distance(myHead, food) < distance(myHead, nextClosestFood)) {
          nextClosestFood = food;
        }
      }
    }
    targetFood = nextClosestFood;
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
    for(const move of possibleMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      if(!offBoard(board, nextCoord)) {
        /** Doesn't take snake off board, does this move cause our snake to run into itself? */
        if(!snakeHitSelfQuestionMark(mySnake, nextCoord)) {
          response.status(200).send({ move: move });
          return;
        }
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

  // If we are close to colliding with another snake's body, avoid it
  let saferMoves = [];
  for (const move of safeMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    let isDangerous = false;
    for (const snake of board.snakes) {
      if (snake.id !== mySnake.id) {
        // Check if the next coordinate is adjacent to another snake's body
        for (const segment of snake.body) {
          if (coordEqual(nextCoord, segment)) {
            isDangerous = true;
            break;
          }
        }
        // If the other snake is bigger, avoid moving next to its head
        if (snake.length >= myLength) {
          const theirHead = snake.head;
          const adjacentCoords = [
            { x: theirHead.x, y: theirHead.y +1 },
            { x: theirHead.x, y: theirHead.y -1 },
            { x: theirHead.x +1, y: theirHead.y },
            { x: theirHead.x -1, y: theirHead.y },
          ];
          for (const adjCoord of adjacentCoords) {
            if (coordEqual(nextCoord, adjCoord)) {
              isDangerous = true;
              break;
            }
          }
        }
        if (isDangerous) break;
      }
    }
    if (!isDangerous) {
      saferMoves.push(move);
    }
  }

  // If there are safer moves after avoiding other snakes, use them
  if (saferMoves.length > 0) {
    safeMoves = saferMoves;
  }

  // Choose the best move from safeMoves
  let bestMove = null;
  let shortestDistance = Infinity;
  for (const move of safeMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    const dist = target ? distance(nextCoord, target) : 0;
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
    for(const move of possibleMoves) {
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
  // Stop hitting yourself
  if(snakeHitSelfQuestionMark(mySnake, coord)) {
    return false;
  }
  // Avoid other snakes' bodies
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }
  // Avoid moving adjacent to larger snakes' heads
  for (const snake of board.snakes) {
    if (snake.id !== mySnake.id && snake.length >= mySnake.length) {
      const theirHead = snake.head;
      const adjacentCoords = [
        { x: theirHead.x, y: theirHead.y +1 },
        { x: theirHead.x, y: theirHead.y -1 },
        { x: theirHead.x +1, y: theirHead.y },
        { x: theirHead.x -1, y: theirHead.y },
      ];
      for (const adjCoord of adjacentCoords) {
        if (coordEqual(coord, adjCoord)) return false;
      }
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
