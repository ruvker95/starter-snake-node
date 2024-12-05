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

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

function handleMove(request, response) {
  const gameData = request.body;
  const board = gameData.board;
  const mySnake = gameData.you;
  const myHead = mySnake.head;
  const myLength = mySnake.length;
  const myHealth = mySnake.health;
  const snakes = board.snakes;
  const foods = board.food;
  const possibleMoves = ['up', 'down', 'left', 'right'];

  // We always try to think 3 steps ahead from the start
  const lookAheadSteps = 3;

  // If no food: fallback to safe move and run look-ahead
  if (!foods || foods.length === 0) {
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    safeMove = ensureNoWallTrap(board, mySnake, myHead, safeMove, possibleMoves);
    safeMove = multiStepLookAhead(board, mySnake, myHead, safeMove, possibleMoves, lookAheadSteps);
    console.log('MOVE:', safeMove);
    response.status(200).send({ move: safeMove });
    return;
  }

  // BFS to find shortest paths to foods
  const { distances, parents } = bfsFindFoods(board, mySnake, myHead);

  // Evaluate candidate foods (shortest safe path + space check)
  let candidateFoods = [];
  for (const food of foods) {
    const fKey = `${food.x},${food.y}`;
    if (distances[fKey] !== undefined) {
      const path = reconstructPath(myHead, food, parents);
      if (path && path.length > 0) {
        // Simulate after eating
        const finalSnakeBody = simulateSnakeAfterPath(mySnake, path);
        const finalHead = path[path.length - 1];
        const reachableArea = floodFill(board, finalSnakeBody, finalHead);

        // Ensure enough space after eating
        if (reachableArea < finalSnakeBody.length) continue;

        // Check if worth chasing considering enemies
        if (!isFoodWorthChasing(food, path.length, board, mySnake, snakes, myHealth)) continue;

        candidateFoods.push({ food, path, distance: path.length, reachableArea });
      }
    }
  }

  let chosenMove;
  if (candidateFoods.length === 0) {
    // No suitable food, fallback to safe move
    chosenMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    chosenMove = ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves);
  } else {
    // Pick the best candidate: shortest path, then largest reachable area
    candidateFoods.sort((a, b) => {
      if (a.distance === b.distance) {
        return b.reachableArea - a.reachableArea;
      }
      return a.distance - b.distance;
    });

    const bestCandidate = candidateFoods[0];
    if (bestCandidate.path.length > 1) {
      const nextCell = bestCandidate.path[1];
      chosenMove = directionFromTo(myHead, nextCell);
      chosenMove = ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves);
    } else {
      // Already on food cell, fallback
      chosenMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
      chosenMove = ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves);
    }
  }

  // Always run 3-step look-ahead
  chosenMove = multiStepLookAhead(board, mySnake, myHead, chosenMove, possibleMoves, lookAheadSteps);

  console.log('MOVE:', chosenMove);
  response.status(200).send({ move: chosenMove });
}

//=====================
// MULTI-STEP LOOK-AHEAD LOGIC
//=====================
function multiStepLookAhead(board, mySnake, myHead, initialMove, possibleMoves, steps) {
  const nextPos = moveAsCoord(initialMove, myHead);
  if (!isSafeToPass(board, mySnake, nextPos)) {
    // If initial move not safe, try alternatives
    for (const alt of possibleMoves) {
      if (alt === initialMove) continue;
      const altPos = moveAsCoord(alt, myHead);
      if (isSafeToPass(board, mySnake, altPos) && lookAheadSimulation(board, mySnake, myHead, alt, possibleMoves, steps)) {
        return alt;
      }
    }
    return initialMove;
  }

  if (!lookAheadSimulation(board, mySnake, myHead, initialMove, possibleMoves, steps)) {
    // If initial fails future-check, try alternatives
    for (const alt of possibleMoves) {
      if (alt === initialMove) continue;
      const altPos = moveAsCoord(alt, myHead);
      if (isSafeToPass(board, mySnake, altPos) && lookAheadSimulation(board, mySnake, myHead, alt, possibleMoves, steps)) {
        return alt;
      }
    }
  }

  return initialMove;
}

function lookAheadSimulation(board, mySnake, myHead, initialMove, possibleMoves, steps) {
  let simBody = mySnake.body.map(p => ({x: p.x, y: p.y}));
  let currentHead = {x: myHead.x, y: myHead.y};

  // First move
  currentHead = moveAsCoord(initialMove, currentHead);
  simBody = simulateSingleMove(simBody, currentHead);
  if (!isSafeToPassForBody(board, simBody)) return false;

  let currentDirection = initialMove;
  for (let i = 2; i <= steps; i++) {
    // Try continuing forward first, else try others
    let candidateMoves = [currentDirection, ...possibleMoves.filter(m => m !== currentDirection)];
    let foundSafe = false;
    for (const move of candidateMoves) {
      const nextPos = moveAsCoord(move, currentHead);
      let nextBody = simulateSingleMove(simBody, nextPos);
      if (isSafeToPassForBody(board, nextBody)) {
        currentHead = nextPos;
        simBody = nextBody;
        currentDirection = move;
        foundSafe = true;
        break;
      }
    }
    if (!foundSafe) return false;
  }

  return true;
}

//=====================
// WALL & CORRIDOR CHECKS
//=====================
function ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves) {
  const nextCoord = moveAsCoord(chosenMove, myHead);
  if (!isSafeToPass(board, mySnake, nextCoord)) {
    let altMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    return altMove;
  }

  // Check space after move
  let simulatedBody = mySnake.body.map(s => ({x: s.x, y: s.y}));
  simulatedBody.unshift(nextCoord);
  simulatedBody.pop();

  const spaceAvailable = floodFillForSafety(board, simulatedBody, nextCoord);
  const neededSpace = mySnake.length;
  if (spaceAvailable < neededSpace) {
    // If not enough space, try alternatives
    for (const move of possibleMoves) {
      if (move === chosenMove) continue;
      const altCoord = moveAsCoord(move, myHead);
      if (isSafeToPass(board, mySnake, altCoord)) {
        let altBody = mySnake.body.map(s => ({x: s.x, y: s.y}));
        altBody.unshift(altCoord);
        altBody.pop();
        const altSpace = floodFillForSafety(board, altBody, altCoord);
        if (altSpace >= neededSpace) {
          return move;
        }
      }
    }
  }

  return chosenMove;
}

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
        // Enemy gets there sooner
        if (otherLength >= myLength) return false;
        else if (!desperate) return false;
      } else if (otherDist === myDistance) {
        // Tie
        if (otherLength >= myLength && !desperate) return false;
        if (otherLength === myLength && !desperate) return false;
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
      // intermediate steps remove tail
      body.pop();
    }
    // last step grows snake
  }
  return body;
}

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
// BASIC UTILS
//=====================
function fallbackSafeMove(board, mySnake, myHead, possibleMoves) {
  let safeMoves = [];
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafeToPass(board, mySnake, nextCoord)) {
      safeMoves.push(move);
    }
  }
  return safeMoves.length > 0 ? safeMoves[0] : 'up';
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
  // Avoid own body & other snakes
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }

  // Avoid head-on collisions with equal or larger snakes
  for (const snake of board.snakes) {
    if (snake.id !== mySnake.id && snake.length >= mySnake.length) {
      const theirNext = possibleNextPositions(snake.head);
      for (const n of theirNext) {
        if (coordEqual(n, coord)) return false;
      }
    }
  }

  return true;
}

function possibleNextPositions(head) {
  return [
    {x: head.x, y: head.y+1},
    {x: head.x, y: head.y-1},
    {x: head.x-1, y: head.y},
    {x: head.x+1, y: head.y}
  ];
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

function simulateSingleMove(body, newHead) {
  return [{x: newHead.x, y: newHead.y}, ...body.slice(0, body.length - 1)];
}

function isSafeToPassForBody(board, body) {
  const head = body[0];
  if (offBoard(board, head)) return false;
  // Check collisions with any snake
  for (const snake of board.snakes) {
    for (const seg of snake.body) {
      if (coordEqual(head, seg)) return false;
    }
  }
  // Check self-overlap
  let seen = new Set();
  for (let i = 1; i < body.length; i++) {
    const key = `${body[i].x},${body[i].y}`;
    if (coordEqual(head, body[i])) return false;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}
