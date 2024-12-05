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
    color: '#660033',     // Dark red
    head: 'workout',      // Workout head
    tail: 'sharp',        // Sharp tail
    name: 'Edge Enforcer' // Creative name
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
  const board = gameData.board;

  // Determine the current state of the snake
  let currentSnakeState = decideSnakeState(gameData, mySnake);

  // Determine the target based on the current state
  let targetInfo = determineTarget(currentSnakeState, gameData, mySnake);

  // Get safe moves
  let safeMoves = getSafeMoves(board, mySnake, myHead);

  // Choose the best move towards the target
  let bestMove = chooseBestMove(safeMoves, myHead, targetInfo, currentSnakeState, gameData);

  if (bestMove) {
    console.log('MOVE:', bestMove);
    response.status(200).send({ move: bestMove });
  } else {
    // Default to any safe move if no best move is found
    console.log('No best move found, defaulting to safe move.');
    if (safeMoves.length > 0) {
      response.status(200).send({ move: safeMoves[0] });
    } else {
      // As a last resort, move 'up'
      response.status(200).send({ move: 'up' });
    }
  }
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

// Determine the snake's current strategy based on the game state
function decideSnakeState(gameData, mySnake) {
  const board = gameData.board;
  const numSnakes = board.snakes.length;
  const myLength = mySnake.length;
  const myHead = mySnake.head;
  let state = 'hungry';

  // Check for nearby snakes
  let nearbySnakes = board.snakes.filter(snake => {
    if (snake.id !== mySnake.id) {
      return distance(myHead, snake.head) <= 3;
    }
    return false;
  });

  // Separate bigger and smaller nearby snakes
  let biggerSnakesNearby = nearbySnakes.filter(snake => snake.length >= myLength);
  let smallerSnakesNearby = nearbySnakes.filter(snake => snake.length < myLength);

  if (numSnakes === 2 && myLength >= 12) {
    // Attempt to trap the other snake if they are at the edge
    const otherSnake = board.snakes.find(snake => snake.id !== mySnake.id);
    if (isAtEdge(otherSnake.head, board)) {
      state = 'trap';
    } else {
      state = 'attack';
    }
  } else if (myLength >= 20) {
    // Fill space when big enough
    state = 'fill_space';
  } else if (biggerSnakesNearby.length > 0) {
    // Be defensive if bigger snakes are nearby
    state = 'defensive';
  } else if (smallerSnakesNearby.length > 0 && myLength > 5) {
    // Attack smaller snakes
    state = 'attack';
  } else {
    state = 'hungry';
  }

  return state;
}

// Determine the target based on the current state
function determineTarget(state, gameData, mySnake) {
  const board = gameData.board;
  const myHead = mySnake.head;
  let target = null;

  if (state === 'hungry') {
    // Move towards the closest food using BFS to find the shortest path
    const obstacles = getObstacles(board, mySnake);
    const foods = board.food;

    let bestScore = -Infinity;
    let bestPath = null;
    let bestFood = null;

    for (const food of foods) {
      const result = bfsShortestPath(board, myHead, [food], obstacles);
      if (result) {
        const pathLength = result.path.length;

        // Compare our path length to other snakes' path lengths
        let otherSnakeCanGetThereFaster = false;

        for (const snake of board.snakes) {
          if (snake.id === mySnake.id) continue;

          const theirObstacles = getObstacles(board, snake);
          const theirResult = bfsShortestPath(board, snake.head, [food], theirObstacles);

          if (theirResult && theirResult.path.length <= pathLength) {
            otherSnakeCanGetThereFaster = true;
            break;
          }
        }

        if (!otherSnakeCanGetThereFaster) {
          // Calculate food cluster score
          let clusterScore = 0;
          for (const otherFood of foods) {
            if (distance(food, otherFood) <= 2) {
              clusterScore += 1;
            }
          }

          const score = -pathLength + clusterScore;

          if (score > bestScore) {
            bestScore = score;
            bestPath = result.path;
            bestFood = food;
          }
        }
      }
    }

    if (bestFood) {
      return { target: bestFood, path: bestPath };
    } else {
      // No reachable food where we can get there faster
      // Move towards the closest food anyway
      const closestFood = findClosestFood(board, myHead);
      const result = bfsShortestPath(board, myHead, [closestFood], obstacles);
      if (result) {
        return { target: closestFood, path: result.path };
      }
    }
  } else if (state === 'defensive') {
    // Move away from bigger snakes
    let biggerSnakesNearby = board.snakes.filter(snake => snake.id !== mySnake.id && snake.length >= mySnake.length);
    target = moveAwayFromSnakes(board, mySnake, biggerSnakesNearby);
    return { target: target };
  } else if (state === 'attack') {
    // Move towards smaller snakes
    let smallerSnakes = board.snakes.filter(snake => snake.id !== mySnake.id && snake.length < mySnake.length);
    target = findClosestSnakeHead(smallerSnakes, myHead);
    return { target: target };
  } else if (state === 'trap') {
    // Plan to trap the other snake
    const otherSnake = board.snakes.find(snake => snake.id !== mySnake.id);
    target = planTrapMove(board, mySnake, otherSnake);
    return { target: target };
  } else if (state === 'fill_space') {
    // Fill the largest open space
    target = findLargestOpenSpace(board, mySnake);
    return { target: target };
  }

  return { target: target };
}

// Get safe moves considering the board and snake positions
function getSafeMoves(board, mySnake, myHead) {
  const possibleMoves = ['up', 'down', 'left', 'right'];
  let safeMoves = [];
  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (isSafe(board, mySnake, nextCoord)) {
      safeMoves.push(move);
    }
  }
  return safeMoves;
}

// Choose the best move towards the target
function chooseBestMove(safeMoves, myHead, targetInfo, state, gameData) {
  if (safeMoves.length === 0) return null;

  if (state === 'hungry' && targetInfo && targetInfo.path && targetInfo.path.length > 0) {
    const nextMove = targetInfo.path[0];
    if (safeMoves.includes(nextMove)) {
      return nextMove;
    } else {
      // The next move towards the food is not safe, pick another safe move
      return safeMoves[0];
    }
  } else {
    // Move towards the target
    let minDistance = Infinity;
    let bestMove = null;
    for (const move of safeMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      const dist = distance(nextCoord, targetInfo.target);
      if (dist < minDistance) {
        minDistance = dist;
        bestMove = move;
      }
    }
    return bestMove;
  }
}

// Helper functions
function isAtEdge(coord, board) {
  return coord.x === 0 || coord.y === 0 || coord.x === board.width - 1 || coord.y === board.height - 1;
}

function findClosestFood(board, myHead) {
  let minDistance = Infinity;
  let targetFood = null;
  for (const food of board.food) {
    const dist = distance(myHead, food);
    if (dist < minDistance) {
      minDistance = dist;
      targetFood = food;
    }
  }
  return targetFood;
}

function moveAwayFromSnakes(board, mySnake, snakes) {
  let dx = 0;
  let dy = 0;
  for (const snake of snakes) {
    dx += mySnake.head.x - snake.head.x;
    dy += mySnake.head.y - snake.head.y;
  }
  dx = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  dy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const target = { x: mySnake.head.x + dx, y: mySnake.head.y + dy };
  return target;
}

function findClosestSnakeHead(snakes, myHead) {
  let minDistance = Infinity;
  let targetSnakeHead = null;
  for (const snake of snakes) {
    const dist = distance(myHead, snake.head);
    if (dist < minDistance) {
      minDistance = dist;
      targetSnakeHead = snake.head;
    }
  }
  return targetSnakeHead;
}

function planTrapMove(board, mySnake, otherSnake) {
  const adjacentCoords = getAdjacentCoords(otherSnake.head);
  for (const coord of adjacentCoords) {
    if (isSafe(board, mySnake, coord) && !isSafe(board, otherSnake, coord)) {
      return coord;
    }
  }
  return otherSnake.head;
}

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
  if (offBoard(board, coord)) return false;
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
    if (coordEqual(coord, segment)) {
      return true;
    }
  }
  return false;
}

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

// BFS to find the shortest path to the target
function bfsShortestPath(board, start, targets, obstacles) {
  const queue = [];
  const visited = {};
  queue.push({ coord: start, path: [] });
  visited[coordKey(start)] = true;

  const targetKeys = new Set(targets.map(coordKey));

  while (queue.length > 0) {
    const current = queue.shift();
    const currentCoord = current.coord;
    const currentPath = current.path;

    if (targetKeys.has(coordKey(currentCoord))) {
      return { target: currentCoord, path: currentPath };
    }

    const neighbors = getAdjacentCoords(currentCoord);

    for (const neighbor of neighbors) {
      const key = coordKey(neighbor);

      if (visited[key]) continue;
      if (offBoard(board, neighbor)) continue;
      if (obstacles.has(key)) continue;

      visited[key] = true;
      const move = getMoveFromCoords(currentCoord, neighbor);
      queue.push({ coord: neighbor, path: currentPath.concat(move) });
    }
  }

  // No path found
  return null;
}

function coordKey(coord) {
  return `${coord.x},${coord.y}`;
}

function getMoveFromCoords(from, to) {
  if (to.x === from.x && to.y === from.y + 1) return 'up';
  if (to.x === from.x && to.y === from.y - 1) return 'down';
  if (to.x === from.x - 1 && to.y === from.y) return 'left';
  if (to.x === from.x + 1 && to.y === from.y) return 'right';
  return null; // Should not happen
}

function getObstacles(board, mySnake) {
  const obstacles = new Set();

  // Add all snakes' bodies
  for (const snake of board.snakes) {
    for (const segment of snake.body) {
      obstacles.add(coordKey(segment));
    }
  }

  return obstacles;
}
