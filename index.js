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
  const possibleSnakeStates = ['hungry', 'avoid_snakes', 'find_space'];
  let currentSnakeState = 'hungry';

  // Determine the closest food
  let targetFood = null;
  let minFoodDistance = Infinity;
  for (const food of board.food) {
    const dist = distance(myHead, food);
    if (dist < minFoodDistance) {
      minFoodDistance = dist;
      targetFood = food;
    }
  }

  // Check if there are multiple foods close by (within 2 units)
  let nearbyFoods = board.food.filter(food => distance(myHead, food) <= 2);

  // Check if there are multiple snakes close by (within 3 units)
  let nearbySnakes = board.snakes.filter(snake => {
    if (snake.id !== mySnake.id) {
      return distance(myHead, snake.head) <= 3;
    }
    return false;
  });

  // Decide movement target based on snake length and nearby elements
  if (nearbySnakes.length > 0) {
    currentSnakeState = 'avoid_snakes';
  } else if (nearbyFoods.length >= 2) {
    // If multiple foods are close by and no snakes nearby, stick to it
    // Set target to the center of nearby foods
    const avgX = Math.round(nearbyFoods.reduce((sum, food) => sum + food.x, 0) / nearbyFoods.length);
    const avgY = Math.round(nearbyFoods.reduce((sum, food) => sum + food.y, 0) / nearbyFoods.length);
    targetFood = { x: avgX, y: avgY };
  } else if (targetFood && nearbySnakes.length === 0) {
    // Proceed to closest food if no snakes are nearby
    currentSnakeState = 'hungry';
  } else {
    // If snakes are near the closest food, find next closest safe food
    let safeFoods = board.food.filter(food => {
      for (const snake of board.snakes) {
        if (snake.id !== mySnake.id && distance(snake.head, food) <= 3) {
          return false; // Food is near another snake
        }
      }
      return true;
    });

    // Find the closest safe food
    targetFood = null;
    minFoodDistance = Infinity;
    for (const food of safeFoods) {
      const dist = distance(myHead, food);
      if (dist < minFoodDistance) {
        minFoodDistance = dist;
        targetFood = food;
      }
    }

    // If no safe food, just avoid snakes
    if (!targetFood) {
      currentSnakeState = 'avoid_snakes';
    }
  }

  let target = null;

  if (currentSnakeState === 'find_space') {
    // When snake is big enough, find open space to move
    target = findLargestOpenSpace(board, mySnake);
  } else if (currentSnakeState === 'hungry' || currentSnakeState === 'avoid_snakes') {
    target = targetFood;
  }

  // If no target found, default to safe move
  if (!target) {
    for (const move of possibleMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      if (!offBoard(board, nextCoord) && isSafe(board, mySnake, nextCoord)) {
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

  // Evaluate moves based on space and potential collisions with larger snakes
  let bestMove = null;
  let maxScore = -Infinity;
  for (const move of safeMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    const space = floodFill(board, mySnake, nextCoord);
    const collisionRisk = evaluateCollisionRisk(board, mySnake, nextCoord);
    const score = space - collisionRisk;
    if (score > maxScore) {
      maxScore = score;
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
      if (!offBoard(board, nextCoord) && !snakeHitSelfQuestionMark(mySnake, nextCoord)) {
        response.status(200).send({ move: move });
        return;
      }
    }
    // As a last resort, default to 'up'
    response.status(200).send({ move: 'up' });
  }
}

/**
 * Evaluate collision risk based on other snakes' sizes
 * @param {*} board 
 * @param {*} mySnake 
 * @param {*} coord 
 * @returns A risk score (higher means higher risk)
 */
function evaluateCollisionRisk(board, mySnake, coord) {
  let risk = 0;
  for (const snake of board.snakes) {
    if (snake.id !== mySnake.id) {
      const theirHead = snake.head;
      const theirLength = snake.length;
      const distanceToTheirHead = distance(coord, theirHead);
      if (distanceToTheirHead === 0) {
        // Avoid head-on collision with larger or equal snakes
        if (theirLength >= mySnake.length) {
          risk += 100;
        }
      } else if (distanceToTheirHead <= 2) {
        // Increase risk if close to a larger snake
        if (theirLength >= mySnake.length) {
          risk += (3 - distanceToTheirHead) * 10;
        }
      }
      // Avoid their bodies
      for (const segment of snake.body) {
        if (coordEqual(coord, segment)) {
          risk += 100;
        }
      }
    }
  }
  return risk;
}

/**
 * Finds the center of the largest open space on the board
 * @param {*} board 
 * @param {*} mySnake 
 * @returns Coordinate of the largest open space
 */
function findLargestOpenSpace(board, mySnake) {
  const width = board.width;
  const height = board.height;
  let maxSpace = 0;
  let bestCoord = mySnake.head;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const coord = { x: x, y: y };
      if (isSafe(board, mySnake, coord)) {
        const space = floodFill(board, mySnake, coord);
        if (space > maxSpace) {
          maxSpace = space;
          bestCoord = coord;
        }
      }
    }
  }

  return bestCoord;
}

/**
 * Simple flood fill to estimate open space from a coordinate
 * @param {*} board 
 * @param {*} mySnake 
 * @param {*} coord 
 * @returns 
 */
function floodFill(board, mySnake, coord) {
  const stack = [coord];
  const visited = {};
  let count = 0;
  while (stack.length > 0 && count < 200) { // Increased limit for larger snakes
    const current = stack.pop();
    const key = `${current.x},${current.y}`;
    if (visited[key]) continue;
    visited[key] = true;
    count++;

    const neighbors = getAdjacentCoords(current);
    for (const neighbor of neighbors) {
      if (!offBoard(board, neighbor) && isSafe(board, mySnake, neighbor) && !visited[`${neighbor.x},${neighbor.y}`]) {
        stack.push(neighbor);
      }
    }
  }
  return count;
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
  if (snakeHitSelfQuestionMark(mySnake, coord)) {
    return false;
  }
  // Avoid other snakes' bodies
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }
  // Avoid potential head-on collisions
  for (const snake of board.snakes) {
    if (snake.id !== mySnake.id) {
      const theirNextCoords = getAdjacentCoords(snake.head);
      for (const nextCoord of theirNextCoords) {
        if (coordEqual(coord, nextCoord)) {
          // Avoid if the other snake is equal or larger
          if (snake.length >= mySnake.length) {
            return false;
          }
        }
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
