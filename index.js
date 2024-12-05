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
  const myHealth = mySnake.health;
  const myLength = mySnake.length;
  const snakes = board.snakes;

  const possibleMoves = ['up', 'down', 'left', 'right'];
  const foods = board.food;

  if (!foods || foods.length === 0) {
    // No food available, fallback to a safe move
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    response.status(200).send({ move: safeMove });
    return;
  }

  // Perform a BFS from myHead to find shortest paths to foods
  const { distances, parents } = bfsFindFoods(board, mySnake, myHead);

  // Evaluate candidate foods
  let candidateFoods = [];
  for (const food of foods) {
    const fKey = `${food.x},${food.y}`;
    if (distances[fKey] !== undefined) {
      // Reconstruct path to this food
      const path = reconstructPath(myHead, food, parents);
      if (path && path.length > 0) {
        // Simulate the snake after following this path
        const finalSnakeBody = simulateSnakeAfterPath(mySnake, path);
        const finalHead = path[path.length - 1];
        const reachableArea = floodFill(board, finalSnakeBody, finalHead);

        // Initial safety check: enough space?
        if (reachableArea < finalSnakeBody.length) {
          // Not enough space, discard
          continue;
        }

        // New logic: Check enemy snakes competition for the same food
        // If another snake of same or larger size can reach at same or fewer steps, avoid
        if (!isFoodWorthChasing(food, path.length, board, mySnake, snakes, myHealth)) {
          continue;
        }

        candidateFoods.push({
          food,
          path,
          distance: path.length,
          reachableArea
        });
      }
    }
  }

  if (candidateFoods.length === 0) {
    // No suitable candidates after competition checks
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    response.status(200).send({ move: safeMove });
    return;
  }

  // Sort candidates: shortest path first, then largest reachable area
  candidateFoods.sort((a, b) => {
    if (a.distance === b.distance) {
      return b.reachableArea - a.reachableArea;
    }
    return a.distance - b.distance;
  });

  const bestCandidate = candidateFoods[0];
  // Execute the first step towards the chosen food
  if (bestCandidate.path.length > 1) {
    const nextCell = bestCandidate.path[1];
    const move = directionFromTo(myHead, nextCell);
    console.log('MOVE:', move, 'towards food:', bestCandidate.food);
    response.status(200).send({ move: move });
  } else {
    // Path of length 1 means we are already on the food? Just pick a safe fallback
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    response.status(200).send({ move: safeMove });
  }
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

/**
 * Checks whether it's worth chasing a piece of food considering enemy snakes.
 *
 * Conditions:
 * - If another snake is equal or larger, and can reach the food in <= our distance,
 *   avoid that food (likely head-on collision scenario).
 * - If another snake is bigger and can tie or beat us to the food, avoid.
 * - If smaller snakes can tie, we may still attempt it if we need the food (low health) 
 *   or we’re bigger and can scare them off.
 *
 * For a more advanced "look ahead", one could simulate partial moves, but we rely on BFS distance.
 */
function isFoodWorthChasing(targetFood, myDistance, board, mySnake, snakes, myHealth) {
  const myLength = mySnake.length;

  // If we have decent health, we can be more picky
  // If low health, we might risk going for contested food
  const lowHealthThreshold = 30; // Example threshold
  const desperate = (myHealth < lowHealthThreshold);

  // Check other snakes
  for (const otherSnake of snakes) {
    if (otherSnake.id === mySnake.id) continue; // skip self

    const otherLength = otherSnake.length;

    // Find shortest path for other snake to the same food
    const {distances: otherDistances} = bfsFromSnakeHead(board, otherSnake);
    const fKey = `${targetFood.x},${targetFood.y}`;
    const otherDist = otherDistances[fKey];

    if (otherDist !== undefined) {
      // Another snake can reach the food
      if (otherDist < myDistance) {
        // They can get there sooner
        if (otherLength >= myLength) {
          // Bigger or equal snake beats us to the food => avoid
          return false;
        } else {
          // They are smaller and get there sooner => risky
          // If we are desperate for food, maybe we still go for it?
          if (!desperate) return false;
        }
      } else if (otherDist === myDistance) {
        // They can get there at the same time
        if (otherLength >= myLength) {
          // Equal or bigger at same time => collision risk, avoid
          return false;
        } else {
          // Smaller snake arrives same time, we might attempt if we want to assert dominance
          // If not desperate, we can still avoid to be safe
          // But if we are bigger and confident, we can go for it
          // For simplicity: if we are bigger than them, we go for it; if equal size and they tie, avoid.
          if (otherLength === myLength) {
            // Same size tie is risky => avoid if not desperate
            if (!desperate) return false;
          }
          // If we are bigger, no problem, we proceed.
        }
      } else {
        // We get there sooner, no problem from this snake
        // Unless it's bigger and can catch us later?
        // If they are bigger but slower, less immediate risk. We'll proceed.
      }
    }
  }

  return true;
}

/**
 * BFS to find shortest paths to all foods for the main snake
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
 * BFS for other snakes to see how quickly they can reach the target food.
 */
function bfsFromSnakeHead(board, otherSnake) {
  const start = otherSnake.head;
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
      if (!visited[nKey] && isSafeToPass(board, otherSnake, neighbor)) {
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

function pathLengthFromParents(start, end, parents) {
  let length = 0;
  let currentKey = `${end.x},${end.y}`;
  const startKey = `${start.x},${start.y}`;
  while (currentKey !== startKey) {
    const parentKey = parents[currentKey];
    currentKey = parentKey;
    length++;
    if (!currentKey) break;
  }
  return length;
}

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
 * Simulate snake body after taking a given path and eating food at the end.
 */
function simulateSnakeAfterPath(mySnake, path) {
  let body = mySnake.body.map(segment => ({x: segment.x, y: segment.y}));
  for (let i = 1; i < path.length; i++) {
    // Move head
    body.unshift({x: path[i].x, y: path[i].y});
    if (i < path.length - 1) {
      // Intermediate step, remove tail
      body.pop();
    } 
    // On last step (eating), no tail removal => growth
  }
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
  // Last resort
  return 'up';
}

function directionFromTo(from, to) {
  if (to.y > from.y) return 'up';
  if (to.y < from.y) return 'down';
  if (to.x > from.x) return 'right';
  if (to.x < from.x) return 'left';
  return 'up';
}

function offBoard(board, coord) {
  return coord.x < 0 || coord.y < 0 || coord.x >= board.width || coord.y >= board.height;
}

function isSafeToPass(board, mySnake, coord) {
  if (offBoard(board, coord)) return false;
  // Avoid all snake bodies
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }
  return true;
}

function coordEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function getAdjacentCoords(coord) {
  return [
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x + 1, y: coord.y }
  ];
}

function moveAsCoord(move, head) {
  switch (move) {
    case 'up': return { x: head.x, y: head.y + 1 };
    case 'down': return { x: head.x, y: head.y - 1 };
    case 'left': return { x: head.x - 1, y: head.y };
    case 'right': return { x: head.x + 1, y: head.y };
  }
}

/**
 * If needed, a function to check snake hitting itself can remain,
 * but we rely on isSafeToPass for BFS and immediate safety checks.
 */
function snakeHitSelf(mySnake, coord) {
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment)) {
      return true;
    }
  }
  return false;
}
