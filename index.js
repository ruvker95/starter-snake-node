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
    color: '#660033',
    head: 'workout',
    tail: 'sharp',
    name: 'Edge Enforcer'
  };
  response.status(200).json(battlesnakeInfo);
}

function handleStart(request, response) {
  console.log('START');
  response.status(200).send('ok');
}

function handleMove(request, response) {
  const gameData = request.body;
  const board = gameData.board;
  const mySnake = gameData.you;
  const myHead = mySnake.head;

  const possibleMoves = ['up', 'down', 'left', 'right'];

  // Identify candidate foods
  const foods = board.food;
  if (!foods || foods.length === 0) {
    // No food on the board, fallback to a safe move
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    response.status(200).send({ move: safeMove });
    return;
  }

  // Find shortest paths to all foods using a single BFS
  // This BFS will return shortest distances and paths to reachable food cells
  const { distances, parents } = bfsFindFoods(board, mySnake, myHead);

  // Evaluate each reachable food based on the new criteria
  let candidateFoods = [];
  for (const food of foods) {
    const key = `${food.x},${food.y}`;
    if (distances[key] !== undefined) {
      // Reconstruct path to this food
      const path = reconstructPath(myHead, food, parents);
      if (path && path.length > 0) {
        // Simulate taking this path and eating the food
        const finalSnakeBody = simulateSnakeAfterPath(mySnake, path);
        // After eating the food, run flood-fill to check available space
        const finalHead = path[path.length - 1]; // final head position is food cell
        const reachableArea = floodFill(board, finalSnakeBody, finalHead);

        // Decide if this path is safe: 
        // Check if reachableArea is large enough. Threshold can be snake length or slightly more.
        if (reachableArea >= finalSnakeBody.length) {
          candidateFoods.push({
            food,
            path,
            distance: path.length,
            reachableArea
          });
        }
      }
    }
  }

  // If no candidates passed the checks, fallback
  if (candidateFoods.length === 0) {
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    response.status(200).send({ move: safeMove });
    return;
  }

  // Choose the best candidate:
  // Primary: shortest path distance
  // Secondary (tiebreak): largest reachable area after eating
  candidateFoods.sort((a, b) => {
    if (a.distance === b.distance) {
      return b.reachableArea - a.reachableArea;
    }
    return a.distance - b.distance;
  });

  const bestCandidate = candidateFoods[0];

  // Execute the first step of the chosen path
  // The path includes the head cell as the first cell. We want the direction from myHead to path[1].
  if (bestCandidate.path.length > 1) {
    // path[0] should be myHead, path[1] next cell
    const nextCell = bestCandidate.path[1];
    const move = directionFromTo(myHead, nextCell);
    console.log('MOVE:', move, 'towards food:', bestCandidate.food);
    response.status(200).send({ move: move });
  } else {
    // If path length is 1, food is at our head (unlikely), fallback
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    response.status(200).send({ move: safeMove });
  }
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

//=====================
// UTILITY & HELPER FUNCTIONS
//=====================

/**
 * BFS to find shortest paths to all foods
 * Returns distances and parents dictionary
 * distances: { "x,y": dist }
 * parents: { "x,y": "px,py" }
 */
function bfsFindFoods(board, mySnake, start) {
  const queue = [];
  const visited = {};
  const parents = {};
  const startKey = `${start.x},${start.y}`;

  queue.push(start);
  visited[startKey] = true;

  const distances = {};
  
  while (queue.length > 0) {
    const current = queue.shift();
    const currentKey = `${current.x},${current.y}`;

    // If current cell is a food cell, record distance
    if (isFoodCell(board, current)) {
      distances[currentKey] = pathLengthFromParents(start, current, parents);
    }

    for (const neighbor of getAdjacentCoords(current)) {
      const nKey = `${neighbor.x},${neighbor.y}`;
      if (!visited[nKey] && isSafeToPass(board, mySnake, neighbor)) {
        visited[nKey] = true;
        parents[nKey] = currentKey;
        queue.push(neighbor);
      }
    }
  }

  return { distances, parents };
}

/**
 * Check if a cell is a food cell
 */
function isFoodCell(board, cell) {
  return board.food.some(f => f.x === cell.x && f.y === cell.y);
}

/**
 * Calculate path length by reconstructing from parents
 */
function pathLengthFromParents(start, end, parents) {
  let length = 0;
  let currentKey = `${end.x},${end.y}`;
  const startKey = `${start.x},${start.y}`;
  while (currentKey !== startKey) {
    const parentKey = parents[currentKey];
    currentKey = parentKey;
    length++;
    if (currentKey === undefined) break; // Should not happen if path valid
  }
  return length;
}

/**
 * Reconstruct actual path from head to a target cell using parents
 * Path will be an array of coordinates, starting with head and ending with target
 */
function reconstructPath(start, end, parents) {
  const path = [];
  const startKey = `${start.x},${start.y}`;
  let currentKey = `${end.x},${end.y}`;

  while (currentKey) {
    const [x, y] = currentKey.split(',').map(Number);
    path.push({ x, y });
    if (currentKey === startKey) break;
    currentKey = parents[currentKey];
  }

  path.reverse();
  return path;
}

/**
 * Simulate the snake body after following a given path and eating the food at the end.
 * The path includes the starting head cell as the first cell in the array.
 *
 * Movement rules:
 * - For each intermediate step (not last), move head to next cell and remove tail cell (classic snake move)
 * - On the last step (the cell with the food), move head to the food cell and DO NOT remove tail (snake grows by 1)
 */
function simulateSnakeAfterPath(mySnake, path) {
  // Clone original body
  let body = mySnake.body.map(segment => ({x: segment.x, y: segment.y}));

  // path[0] is current head
  // We assume path[0] is the head’s position at start (which it should be)
  // For each step in path (excluding the first, since it's current head position):
  //   Move head forward
  //   Remove tail on intermediate steps
  // On final step: do not remove tail (due to eating)
  // Initial length
  const originalLength = body.length;

  for (let i = 1; i < path.length; i++) {
    const nextCell = path[i];

    // Add new head
    body.unshift({x: nextCell.x, y: nextCell.y});

    if (i < path.length - 1) {
      // Intermediate step, remove tail
      body.pop();
    } else {
      // Final step (eating food), no tail removal = growth
      // final length = originalLength + 1
    }
  }

  return body;
}

/**
 * Flood-fill to estimate how much open space is available from a given cell,
 * considering the snake’s final body position.
 */
function floodFill(board, finalBody, start) {
  const stack = [start];
  const visited = {};
  const blockedCells = new Set(finalBody.map(s => `${s.x},${s.y}`));
  let count = 0;

  while (stack.length > 0 && count < 1000) {
    const current = stack.pop();
    const key = `${current.x},${current.y}`;
    if (visited[key]) continue;
    visited[key] = true;
    count++;

    for (const neighbor of getAdjacentCoords(current)) {
      if (!offBoard(board, neighbor) && !blockedCells.has(`${neighbor.x},${neighbor.y}`) && !visited[`${neighbor.x},${neighbor.y}`]) {
        stack.push(neighbor);
      }
    }
  }

  return count;
}

/**
 * Determine a fallback safe move if we cannot pursue food safely.
 */
function fallbackSafeMove(board, mySnake, myHead, possibleMoves) {
  // Try safe moves
  let safeMoves = [];
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafeToPass(board, mySnake, nextCoord)) {
      safeMoves.push(move);
    }
  }
  if (safeMoves.length > 0) {
    // Choose any safe move
    return safeMoves[0];
  }
  // No safe moves, move up as last resort
  return 'up';
}

/**
 * Determine direction from one cell to another
 */
function directionFromTo(from, to) {
  if (to.y > from.y) return 'up';
  if (to.y < from.y) return 'down';
  if (to.x > from.x) return 'right';
  if (to.x < from.x) return 'left';
  return 'up'; // fallback
}

//=====================
// SAFETY & BOARD FUNCTIONS
//=====================

function offBoard(board, coord) {
  return coord.x < 0 || coord.y < 0 || coord.x >= board.width || coord.y >= board.height;
}

/**
 * Checks if a cell is safe to pass through (for BFS pathfinding).
 * This differs from isSafe() used previously for immediate moves.
 * Here we just ensure not hitting walls, snake bodies, or other obstacles.
 */
function isSafeToPass(board, mySnake, coord) {
  if (offBoard(board, coord)) return false;
  
  // Avoid any snake body
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }
  return true;
}

/**
 * Given the current code, isSafe is used for immediate moves.
 * We keep it if needed for fallback logic.
 */
function isSafe(board, mySnake, coord) {
  // Avoid walls
  if (offBoard(board, coord)) {
    return false;
  }

  // Avoid self
  if (snakeHitSelf(mySnake, coord)) {
    return false;
  }

  // Avoid other snakes' bodies
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }

  // Avoid potential head-on collisions with larger snakes (optional complexity)
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

function moveAsCoord(move, head) {
  switch (move) {
    case 'up': return { x: head.x, y: head.y + 1 };
    case 'down': return { x: head.x, y: head.y - 1 };
    case 'left': return { x: head.x - 1, y: head.y };
    case 'right': return { x: head.x + 1, y: head.y };
  }
}

function getAdjacentCoords(coord) {
  return [
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x + 1, y: coord.y }
  ];
}

function coordEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function snakeHitSelf(mySnake, coord) {
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment)) {
      return true;
    }
  }
  return false;
}

