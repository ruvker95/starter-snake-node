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

  // Find shortest paths to all foods using BFS
  const { distances, parents } = bfsFindFoods(board, mySnake, myHead);

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
        const finalHead = path[path.length - 1]; 
        const reachableArea = floodFill(board, finalSnakeBody, finalHead);

        // Check if there's enough space after eating
        if (reachableArea >= finalSnakeBody.length) {
          // Before adding as a candidate, check if other snakes can also reach this food as fast or faster
          const myDistance = path.length; // steps to reach the food
          if (!otherSnakesReachFoodFirst(gameData, food, myDistance, mySnake.length)) {
            candidateFoods.push({
              food,
              path,
              distance: myDistance,
              reachableArea
            });
          }
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
  // Secondary: largest reachable area after eating
  candidateFoods.sort((a, b) => {
    if (a.distance === b.distance) {
      return b.reachableArea - a.reachableArea;
    }
    return a.distance - b.distance;
  });

  const bestCandidate = candidateFoods[0];

  // Execute the first step of the chosen path
  if (bestCandidate.path.length > 1) {
    const nextCell = bestCandidate.path[1];
    const move = directionFromTo(myHead, nextCell);
    console.log('MOVE:', move, 'towards food:', bestCandidate.food);
    response.status(200).send({ move: move });
  } else {
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    response.status(200).send({ move: safeMove });
  }
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

//=====================
// NEW LOGIC: Check if other snakes reach the food first
//=====================
function otherSnakesReachFoodFirst(gameData, targetFood, myDistance, myLength) {
  const board = gameData.board;
  const mySnakeId = gameData.you.id;

  for (const snake of board.snakes) {
    if (snake.id === mySnakeId) continue; // skip my snake

    // Run BFS for this other snake to find distance to the same food
    const {dist, found} = bfsDistanceToTarget(board, snake, snake.head, targetFood);
    if (found) {
      // If other snake distance <= myDistance and they are of equal or greater length, risky
      // Even if they are smaller, you might want to avoid the tie to prevent head collision.
      // Adjust logic as desired.
      if (dist <= myDistance) {
        return true;
      }
    }
  }

  return false;
}

//=====================
// BFS and PATH FUNCTIONS
//=====================

/**
 * BFS to find shortest paths to all foods from my snake's head
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
 * A BFS to find distance from a given snake head to a target cell directly
 */
function bfsDistanceToTarget(board, snake, start, target) {
  const queue = [];
  const visited = {};
  const startKey = `${start.x},${start.y}`;
  visited[startKey] = true;
  queue.push({x: start.x, y: start.y, dist: 0});

  while (queue.length > 0) {
    const current = queue.shift();
    if (coordEqual(current, target)) {
      return { dist: current.dist, found: true };
    }
    for (const neighbor of getAdjacentCoords(current)) {
      const nKey = `${neighbor.x},${neighbor.y}`;
      if (!visited[nKey] && isSafeToPassForOther(board, snake, neighbor)) {
        visited[nKey] = true;
        queue.push({x: neighbor.x, y: neighbor.y, dist: current.dist + 1});
      }
    }
  }

  return { dist: Infinity, found: false };
}

function isSafeToPassForOther(board, snake, coord) {
  if (offBoard(board, coord)) return false;
  // Avoid any snake body
  for (const s of board.snakes) {
    for (const segment of s.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }
  return true;
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
    if (currentKey === undefined) break;
  }
  return length;
}

/**
 * Reconstruct path from start to end using parents
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

//=====================
// SNAKE SIMULATION AND FLOOD-FILL
//=====================

function simulateSnakeAfterPath(mySnake, path) {
  let body = mySnake.body.map(segment => ({x: segment.x, y: segment.y}));
  // On each step except the last, move head + remove tail
  // On last step (eating), move head without removing tail
  for (let i = 1; i < path.length; i++) {
    const nextCell = path[i];
    body.unshift({x: nextCell.x, y: nextCell.y});
    if (i < path.length - 1) {
      body.pop();
    }
  }
  // final length = originalLength + 1 after eating
  return body;
}

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

//=====================
// MOVEMENT & SAFETY UTILS
//=====================

function directionFromTo(from, to) {
  if (to.y > from.y) return 'up';
  if (to.y < from.y) return 'down';
  if (to.x > from.x) return 'right';
  if (to.x < from.x) return 'left';
  return 'up'; 
}

function fallbackSafeMove(board, mySnake, myHead, possibleMoves) {
  let safeMoves = [];
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafeToPass(board, mySnake, nextCoord)) {
      safeMoves.push(move);
    }
  }
  if (safeMoves.length > 0) {
    return safeMoves[0];
  }
  return 'up';
}

//=====================
// SHARED LOGIC
//=====================

function offBoard(board, coord) {
  return coord.x < 0 || coord.y < 0 || coord.x >= board.width || coord.y >= board.height;
}

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
