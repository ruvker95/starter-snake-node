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
    color: '#660033', // Dark burgundy
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
  const myLength = mySnake.length;
  const myHealth = mySnake.health;
  const snakes = board.snakes;
  const foods = board.food;
  const possibleMoves = ['up', 'down', 'left', 'right'];

  // If no food available, fallback to a safe move
  if (!foods || foods.length === 0) {
    let safeMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    safeMove = ensureNoWallTrap(board, mySnake, myHead, safeMove, possibleMoves);
    // If longer snake, look 3 steps ahead
    if (myLength > 10) {
      safeMove = threeStepLookAhead(board, mySnake, myHead, safeMove, possibleMoves);
    }
    console.log('MOVE:', safeMove);
    response.status(200).send({ move: safeMove });
    return;
  }

  // BFS to find shortest paths to foods
  const { distances, parents } = bfsFindFoods(board, mySnake, myHead);

  // Evaluate candidate foods
  let candidateFoods = [];
  for (const food of foods) {
    const fKey = `${food.x},${food.y}`;
    if (distances[fKey] !== undefined) {
      const path = reconstructPath(myHead, food, parents);
      if (path && path.length > 0) {
        const finalSnakeBody = simulateSnakeAfterPath(mySnake, path);
        const finalHead = path[path.length - 1];
        const reachableArea = floodFill(board, finalSnakeBody, finalHead);
        if (reachableArea < finalSnakeBody.length) {
          // Not enough space after eating, discard this option
          continue;
        }

        // Check if food is worth chasing considering enemies
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

  let chosenMove;
  const numSnakes = board.snakes.length;

  if (candidateFoods.length === 0) {
    // No suitable food, fallback to safe move
    chosenMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    chosenMove = ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves);
  } else {
    // Sort foods by shortest path, then largest reachable area
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
      // On the food cell already, fallback to safe move
      chosenMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
      chosenMove = ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves);
    }
  }

  // New aggressive logic if only 2 snakes remain
  if (numSnakes === 2) {
    const otherSnake = board.snakes.find(s => s.id !== mySnake.id);
    if (otherSnake) {
      chosenMove = aggressiveStrategy(board, mySnake, otherSnake, chosenMove, possibleMoves);
    }
  }

  // If snake is large, run 3-step look-ahead
  if (myLength > 10) {
    chosenMove = threeStepLookAhead(board, mySnake, myHead, chosenMove, possibleMoves);
  }

  console.log('MOVE:', chosenMove);
  response.status(200).send({ move: chosenMove });
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

//=====================
// AGGRESSIVE STRATEGY WHEN 2 SNAKES REMAIN
//=====================
function aggressiveStrategy(board, mySnake, otherSnake, currentMove, possibleMoves) {
  // If we are bigger or equal and healthy, try a trapping strategy
  const myLength = mySnake.length;
  const otherLength = otherSnake.length;
  const myHealth = mySnake.health;

  // Conditions for aggression
  if (myLength >= otherLength && myHealth > 30) {
    // Try to position between other snake and nearest food
    // Identify nearest food for the other snake
    const theirClosestFood = findClosestFoodForSnake(board, otherSnake);
    if (theirClosestFood) {
      // Try intercepting path to that food
      const interceptMove = attemptInterception(board, mySnake, otherSnake, theirClosestFood, possibleMoves);
      if (interceptMove) {
        return interceptMove;
      }
    }

    // If no interception found, try to limit their space by picking a move that reduces their reachable area
    const blockadeMove = attemptBlockade(board, mySnake, otherSnake, possibleMoves);
    if (blockadeMove) {
      return blockadeMove;
    }
  }

  // If no aggressive move improves situation, return currentMove
  return currentMove;
}

function findClosestFoodForSnake(board, snake) {
  let minDist = Infinity;
  let targetFood = null;
  for (const food of board.food) {
    const d = Math.abs(food.x - snake.head.x) + Math.abs(food.y - snake.head.y);
    if (d < minDist) {
      minDist = d;
      targetFood = food;
    }
  }
  return targetFood;
}

/**
 * Attempt to intercept the other snake’s path to its closest food.
 * We do a BFS from our snake to find a position along the shortest path from other snake to that food
 * If we can occupy a strategic cell first or at the same time, do so.
 */
function attemptInterception(board, mySnake, otherSnake, food, possibleMoves) {
  // Compute other snake’s shortest path to food
  const {distances: otherDist, parents: otherParents} = bfsFromSnakeHead(board, otherSnake);
  const key = `${food.x},${food.y}`;
  if (otherDist[key] === undefined) return null;

  const otherPath = reconstructPath(otherSnake.head, food, otherParents);
  // Choose a point in otherPath that we can reach faster or equally and stand on to block them
  // We try from nearest to the other snake’s head going forward
  const {distances: myDist, parents: myParents} = bfsFindFoods(board, mySnake, mySnake.head);

  let bestInterception = null;
  let bestDistDiff = -Infinity;
  for (const cell of otherPath) {
    const ck = `${cell.x},${cell.y}`;
    if (myDist[ck] !== undefined && otherDist[ck] !== undefined) {
      // If we can get there sooner or at same time and we are bigger, we can hold that position
      const myD = myDist[ck];
      const theirD = otherDist[ck];
      if (myD <= theirD) {
        // Evaluate how strategic this interception is: prefer cells closer to food or mid path
        // Just pick the earliest we can intercept
        const diff = theirD - myD;
        if (diff > bestDistDiff) {
          bestDistDiff = diff;
          bestInterception = cell;
        }
      }
    }
  }

  if (bestInterception) {
    const interceptPath = reconstructPath(mySnake.head, bestInterception, myParents);
    if (interceptPath && interceptPath.length > 1) {
      const nextCell = interceptPath[1];
      let move = directionFromTo(mySnake.head, nextCell);
      move = ensureNoWallTrap(board, mySnake, mySnake.head, move, possibleMoves);
      return move;
    }
  }
  return null;
}

/**
 * Attempt a blockade move that reduces the other snake’s available space.
 * Flood-fill from other snake’s head and see if making a certain move reduces their reachable area.
 */
function attemptBlockade(board, mySnake, otherSnake, possibleMoves) {
  // Try each possible move and pick one that leads to a position reducing other snake’s accessible area
  // after we move.
  const myHead = mySnake.head;
  let bestMove = null;
  let bestAreaReduction = -Infinity;

  const otherAreaBefore = floodFillOpenSpace(board, otherSnake.body, otherSnake.head);

  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafeToPass(board, mySnake, nextCoord)) {
      // Simulate move
      let newMyBody = simulateSingleMove(mySnake.body, nextCoord);
      // Place our head there and see how the other snake’s area changes
      // We add our new head position to blocked spaces
      const combinedBlocked = newMyBody.map(p => `${p.x},${p.y}`);

      const otherAreaAfter = floodFillOpenSpace(board, otherSnake.body, otherSnake.head, combinedBlocked);
      const reduction = otherAreaBefore - otherAreaAfter;
      if (reduction > bestAreaReduction) {
        bestAreaReduction = reduction;
        bestMove = move;
      }
    }
  }

  if (bestMove && bestAreaReduction > 0) {
    return bestMove;
  }
  return null;
}

/**
 * Flood-fill open space accessible to a snake’s head, given certain blocked cells.
 */
function floodFillOpenSpace(board, snakeBody, start, extraBlocked = []) {
  const stack = [start];
  const visited = {};
  const blocked = new Set(snakeBody.map(p => `${p.x},${p.y}`));
  for (const b of extraBlocked) {
    blocked.add(b);
  }

  let count = 0;
  while (stack.length > 0 && count < 2000) {
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
// 3-STEP LOOK-AHEAD LOGIC
//=====================
function threeStepLookAhead(board, mySnake, myHead, initialMove, possibleMoves) {
  const nextPos = moveAsCoord(initialMove, myHead);
  if (!isSafeToPass(board, mySnake, nextPos)) {
    for (const alt of possibleMoves) {
      if (alt === initialMove) continue;
      const altPos = moveAsCoord(alt, myHead);
      if (isSafeToPass(board, mySnake, altPos) && lookAheadSimulation(board, mySnake, myHead, alt, possibleMoves, 3)) {
        return alt;
      }
    }
    return initialMove;
  }

  if (!lookAheadSimulation(board, mySnake, myHead, initialMove, possibleMoves, 3)) {
    for (const alt of possibleMoves) {
      if (alt === initialMove) continue;
      const altPos = moveAsCoord(alt, myHead);
      if (isSafeToPass(board, mySnake, altPos) && lookAheadSimulation(board, mySnake, myHead, alt, possibleMoves, 3)) {
        return alt;
      }
    }
  }

  return initialMove;
}

function lookAheadSimulation(board, mySnake, myHead, initialMove, possibleMoves, steps) {
  let simBody = mySnake.body.map(p => ({x: p.x, y: p.y}));
  let currentHead = {x: myHead.x, y: myHead.y};

  currentHead = moveAsCoord(initialMove, currentHead);
  simBody = simulateSingleMove(simBody, currentHead);
  if (!isSafeToPassForBody(board, simBody)) return false;

  let currentDirection = initialMove;
  for (let i = 2; i <= steps; i++) {
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

function simulateSingleMove(body, newHead) {
  return [{x: newHead.x, y: newHead.y}, ...body.slice(0, body.length - 1)];
}

function isSafeToPassForBody(board, body) {
  const head = body[0];
  if (offBoard(board, head)) return false;
  for (const snake of board.snakes) {
    for (const seg of snake.body) {
      if (coordEqual(head, seg)) return false;
    }
  }
  let seen = new Set();
  for (let i = 1; i < body.length; i++) {
    let key = `${body[i].x},${body[i].y}`;
    if (coordEqual(head, body[i])) return false;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

//=====================
// WALL & CORRIDOR CHECKS
//=====================
function ensureNoWallTrap(board, mySnake, myHead, chosenMove, possibleMoves, snakeLength = null) {
  const nextCoord = moveAsCoord(chosenMove, myHead);
  if (!isSafeToPass(board, mySnake, nextCoord)) {
    let altMove = fallbackSafeMove(board, mySnake, myHead, possibleMoves);
    return altMove;
  }

  let simulatedBody = mySnake.body.map(s => ({x: s.x, y: s.y}));
  simulatedBody.unshift(nextCoord);
  simulatedBody.pop();

  const spaceAvailable = floodFillForSafety(board, simulatedBody, nextCoord);
  const neededSpace = snakeLength || mySnake.length;

  if (spaceAvailable < neededSpace) {
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
    return chosenMove;
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
        // They get there sooner
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
      body.pop(); // intermediate steps remove tail
    }
    // last step: no tail removal = growth
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
  if (safeMoves.length > 0) return safeMoves[0];
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
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      if (coordEqual(coord, segment)) return false;
    }
  }

  // Avoid head-on collisions with equal/larger snakes:
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
