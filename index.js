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
    name: 'TheForce'
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

  // If no food on the board, fallback to safe move
  if (!foods || foods.length === 0) {
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    // Check if safeMove leads into a potential wall trap, try to avoid
    safeMove = ensureNoWallTrap(board, mySnake, myHead, safeMove, possibleMoves);
    response.status(200).send({ move: safeMove });
    return;
  }

  // BFS from myHead to find shortest paths to foods
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

        // Check if we have enough space after eating
        if (reachableArea < finalSnakeBody.length) {
          // Not enough space, discard this candidate
          continue;
        }

        // Check enemy competition for the same food
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
    // No suitable candidates, fallback to safe move
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    safeMove = ensureNoWallTrap(board, mySnake, myHead, safeMove, possibleMoves);
    response.status(200).send({ move: safeMove });
    return;
  }

  // Sort candidates by shortest path, then largest reachable area
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

    // New logic: ensure this move doesn't trap us against a wall
    const finalMove = ensureNoWallTrap(board, mySnake, myHead, move, possibleMoves, myLength);

    console.log('MOVE:', finalMove, 'towards food:', bestCandidate.food);
    response.status(200).send({ move: finalMove });
  } else {
    // If the path is length 1, we are already on the food cell - just pick a safe fallback
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    safeMove = ensureNoWallTrap(board, mySnake, myHead, safeMove, possibleMoves);
    response.status(200).send({ move: safeMove });
  }
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

//=====================
// NEW LOGIC FUNCTIONS
//=====================

/**
 * Ensure that the chosen move doesn't lead to a dead-end or dangerous corridor near a wall.
 * We do this by:
 * 1. Simulating the snake's next position (head + shift of body).
 * 2. Checking if there's enough room ahead after moving.
 * If not enough space is found, try an alternative safe move.
 */
function ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves, snakeLength = null) {
  const nextCoord = moveAsCoord(chosenMove, myHead);
  if (!isSafeToPass(board, mySnake, nextCoord)) {
    // The chosen move is not even safe, fallback immediately
    let altMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    return altMove;
  }

  // Check space after making that move:
  // Simulate snake after one step without growing (normal move)
  // Snake body after move: add head at nextCoord, remove tail
  let simulatedBody = mySnake.body.map(s => ({x: s.x, y: s.y}));
  simulatedBody.unshift({x: nextCoord.x, y: nextCoord.y});
  simulatedBody.pop(); // normal movement

  // Run flood-fill from nextCoord to ensure there's enough open space
  const spaceAvailable = floodFillForSafety(board, simulatedBody, nextCoord);
  const neededSpace = snakeLength || mySnake.length;

  if (spaceAvailable < neededSpace) {
    // Not enough space to maneuver, try other moves
    for (const move of possibleMoves) {
      if (move === chosenMove) continue; // skip same move
      const altCoord = moveAsCoord(move, myHead);
      if (isSafeToPass(board, mySnake, altCoord)) {
        // Simulate and check again
        let altBody = mySnake.body.map(s => ({x: s.x, y: s.y}));
        altBody.unshift(altCoord);
        altBody.pop();
        const altSpace = floodFillForSafety(board, altBody, altCoord);
        if (altSpace >= neededSpace) {
          return move;
        }
      }
    }
    // If no alternative is good, just return chosenMove as last resort
    return chosenMove;
  }

  // If we have enough space, keep chosenMove
  return chosenMove;
}

/**
 * A special flood fill for safety that counts reachable cells not blocked by snake body or walls.
 * Similar to floodFill but doesn’t rely on final growth. Just checks open space from a position.
 */
function floodFillForSafety(board, snakeBody, start) {
  const stack = [start];
  const visited = {};
  const blocked = new Set(snakeBody.map(p => `${p.x},${p.y}`));
  let count = 0;
  
  while (stack.length > 0 && count < 1000) {
    const current = stack.pop();
    const key = `${current.x},${current.y}`;
    if (visited[key]) continue;
    visited[key] = true;
    count++;

    for (const n of getAdjacentCoords(current)) {
      if (!offBoard(board, n) && !blocked.has(`${n.x},${n.y}`) && !visited[`${n.x},${n.y}`]) {
        stack.push(n);
      }
    }
  }
  return count;
}

//=====================
// COMPETITION LOGIC
//=====================

function isFoodWorthChasing(targetFood, myDistance, board, mySnake, snakes, myHealth) {
  const myLength = mySnake.length;
  const lowHealthThreshold = 30;
  const desperate = (myHealth < lowHealthThreshold);

  for (const otherSnake of snakes) {
    if (otherSnake.id === mySnake.id) continue;

    const otherLength = otherSnake.length;
    const {distances: otherDistances} = bfsFromSnakeHead(board, otherSnake);
    const fKey = `${targetFood.x},${targetFood.y}`;
    const otherDist = otherDistances[fKey];

    if (otherDist !== undefined) {
      if (otherDist < myDistance) {
        // They get there sooner
        if (otherLength >= myLength) {
          return false;
        } else {
          // Smaller but faster. If not desperate, avoid
          if (!desperate) return false;
        }
      } else if (otherDist === myDistance) {
        // Arrive same time
        if (otherLength >= myLength) {
          // Equal or bigger: collision risk, avoid if not desperate
          if (!desperate) return false;
        } else {
          // Smaller and tie -> risky but maybe okay if we need food badly
          if (otherLength === myLength && !desperate) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

//=====================
// BFS LOGIC
//=====================

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

//=====================
// PATH & SIMULATION
//=====================

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

function simulateSnakeAfterPath(mySnake, path) {
  let body = mySnake.body.map(segment => ({x: segment.x, y: segment.y}));
  for (let i = 1; i < path.length; i++) {
    body.unshift({x: path[i].x, y: path[i].y});
    if (i < path.length - 1) {
      // intermediate step remove tail
      body.pop();
    }
    // last step: no tail removal, snake grows
  }
  return body;
}

// Similar to before, but used after we know final body is safe
function floodFill(board, finalBody, start) {
  const stack = [start];
  const visited = {};
  const blocked = new Set(finalBody.map(s => `${s.x},${s.y}`));
  let count = 0;

  while (stack.length > 0 && count < 1000) {
    const current = stack.pop();
    const key = `${current.x},${current.y}`;
    if (visited[key]) continue;
    visited[key] = true;
    count++;

    for (const neighbor of getAdjacentCoords(current)) {
      if (!offBoard(board, neighbor) && !blocked.has(`${neighbor.x},${neighbor.y}`) && !visited[`${neighbor.x},${neighbor.y}`]) {
        stack.push(neighbor);
      }
    }
  }

  return count;
}

//=====================
// BASIC SAFETY & MOVE UTILS
//=====================

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
 * snakeHitSelf is not used directly here, but left for reference.
 */
function snakeHitSelf(mySnake, coord) {
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment)) {
      return true;
    }
  }
  return false;
}
