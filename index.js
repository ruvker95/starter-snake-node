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
    tail: 'sharp',       // sharp
    name: 'Edge Enforcer'// Example creative name
  };
  response.status(200).json(battlesnakeInfo);
}

function handleStart(request, response) {
  console.log('START');
  response.status(200).send('ok');
}

function handleMove(request, response) {
  const gameData = request.body;
  const mySnake = gameData.you;
  const myHead = mySnake.head;
  const myLength = mySnake.length;
  const myHealth = mySnake.health;
  const board = gameData.board;
  const possibleMoves = ['up', 'down', 'left', 'right'];

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

  // Basic logic for states (example):
  let currentSnakeState = 'hungry';
  
  // Check nearby snakes for avoidance or attack strategies
  let nearbySnakes = board.snakes.filter(snake => snake.id !== mySnake.id && distance(myHead, snake.head) <= 3);
  if (nearbySnakes.length > 0) {
    // If there are nearby snakes, consider avoiding them
    currentSnakeState = 'avoid_snakes';
  }

  // If no targetFood found or other complexity, fallback to avoid_snakes strategy
  if (!targetFood) {
    currentSnakeState = 'avoid_snakes';
  }

  let target = targetFood;

  // Get safe moves
  let safeMoves = [];
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafe(board, mySnake, nextCoord)) {
      safeMoves.push(move);
    }
  }

  // New override: If the closest food is very close (e.g. distance <= 3),
  // prioritize moving towards it as quickly and directly as possible.
  if (target && minFoodDistance <= 3) {
    // Among the safe moves, choose the one that gets you closest to the targetFood
    let bestMove = null;
    let closestDist = Infinity;
    for (const move of safeMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      const dist = distance(nextCoord, target);
      if (dist < closestDist) {
        closestDist = dist;
        bestMove = move;
      }
    }

    if (bestMove) {
      console.log('CLOSE FOOD MOVE:', bestMove);
      response.status(200).send({ move: bestMove });
      return;
    } else {
      // If no best move, fall back to a safe move
      if (safeMoves.length > 0) {
        response.status(200).send({ move: safeMoves[0] });
        return;
      } else {
        // Last resort
        response.status(200).send({ move: 'up' });
        return;
      }
    }
  }

  // If we're not in the "close food" override scenario, proceed with the original logic:
  if (safeMoves.length === 0) {
    // No safe moves, just do something
    response.status(200).send({ move: 'up' });
    return;
  }

  // Score moves based on open space and collision risk as before
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
    // Default as fallback
    console.log('No best move found, defaulting to safe move.');
    response.status(200).send({ move: safeMoves[0] });
  }
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

/**
 * Evaluate collision risk based on other snakes' sizes
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
 * Find the largest open space (used in original strategies)
 */
function findLargestOpenSpace(board, mySnake) {
  const width = board.width;
  const height = board.height;
  let maxSpace = 0;
  let bestCoord = mySnake.head;

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      const coord = { x, y };
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
 * Flood fill to estimate open space
 */
function floodFill(board, mySnake, coord) {
  const stack = [coord];
  const visited = {};
  let count = 0;
  while (stack.length > 0 && count < 200) {
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

function moveAsCoord(move, head) {
  switch (move) {
    case 'up': return { x: head.x, y: head.y + 1 };
    case 'down': return { x: head.x, y: head.y - 1 };
    case 'left': return { x: head.x - 1, y: head.y };
    case 'right': return { x: head.x + 1, y: head.y };
  }
}

function offBoard(board, coord) {
  return coord.x < 0 || coord.y < 0 || coord.x >= board.width || coord.y >= board.height;
}

function isSafe(board, mySnake, coord) {
  // Avoid walls
  if (offBoard(board, coord)) return false;
  // Avoid self
  if (snakeHitSelfQuestionMark(mySnake, coord)) return false;

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
          if (snake.length >= mySnake.length) {
            return false;
          }
        }
      }
    }
  }
  return true;
}

function getAdjacentCoords(coord) {
  return [
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x + 1, y: coord.y },
  ];
}

function coordEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function snakeHitSelfQuestionMark(mySnake, coord) {
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment))  {
      return true;
    }
  }
  return false;
}
