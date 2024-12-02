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
    color: '#8B0000', // Dark red
    head: 'fang',     // Aggressive head
    tail: 'pixel'     // Funny tail
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
  const board = gameData.board;
  const possibleMoves = ['up', 'down', 'left', 'right'];

  // Avoid moves that are unsafe
  const safeMoves = possibleMoves.filter(move => {
    const nextCoord = moveAsCoord(move, myHead);
    return isSafe(board, mySnake, nextCoord);
  });

  // Evaluate spaces to find the best open area
  let bestMove = null;
  let largestSpace = 0;

  for (const move of safeMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    const space = calculateOpenSpace(board, nextCoord, mySnake);

    if (space > largestSpace) {
      largestSpace = space;
      bestMove = move;
    }
  }

  // If there’s an opportunity to trap the enemy snake, prioritize that
  const trapMove = tryToTrapEnemy(board, mySnake);
  if (trapMove) {
    bestMove = trapMove;
  }

  // Default to a safe move if no open window or trap move is found
  if (!bestMove) {
    bestMove = safeMoves.length > 0 ? safeMoves[0] : 'up';
  }

  console.log('MOVE:', bestMove);
  response.status(200).send({ move: bestMove });
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}

// Helper Functions
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

  // Avoid collisions with self
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment)) {
      return false;
    }
  }

  // Avoid collisions with other snakes
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

function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Calculate the size of the open space from a given coordinate
function calculateOpenSpace(board, coord, mySnake) {
  const visited = new Set();
  let queue = [coord];
  let space = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    const key = `${current.x},${current.y}`;

    if (visited.has(key) || offBoard(board, current)) {
      continue;
    }

    visited.add(key);
    space++;

    for (const move of ['up', 'down', 'left', 'right']) {
      const nextCoord = moveAsCoord(move, current);
      if (isSafe(board, mySnake, nextCoord)) {
        queue.push(nextCoord);
      }
    }
  }

  return space;
}

// Try to trap the enemy snake
function tryToTrapEnemy(board, mySnake) {
  for (const enemy of board.snakes) {
    if (enemy.id === mySnake.id || enemy.length >= mySnake.length) continue;

    const enemyHead = enemy.head;
    const enemyMoves = ['up', 'down', 'left', 'right'].map(move => moveAsCoord(move, enemyHead));
    const possibleTraps = enemyMoves.filter(coord => !isSafe(board, mySnake, coord));

    if (possibleTraps.length >= 2) {
      // Block the remaining open paths
      for (const move of ['up', 'down', 'left', 'right']) {
        const myNextCoord = moveAsCoord(move, mySnake.head);
        if (possibleTraps.some(coord => coordEqual(coord, myNextCoord))) {
          return move;
        }
      }
    }
  }
  return null;
}
