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
    color: '#FF4500', // Aggressive orange-red color
    head: 'fang',     // Aggressive head
    tail: 'sharp'     // Sharp tail
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

  // Avoid unsafe moves
  const safeMoves = possibleMoves.filter(move => {
    const nextCoord = moveAsCoord(move, myHead);
    return isSafe(board, mySnake, nextCoord);
  });

  // Find closest food
  let targetFood = null;
  for (const food of board.food) {
    if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
      targetFood = food;
    }
  }

  // Try to attack smaller snakes
  let targetSnake = null;
  for (const snake of board.snakes) {
    if (snake.id !== mySnake.id && snake.length < myLength) {
      if (!targetSnake || distance(myHead, snake.head) < distance(myHead, targetSnake.head)) {
        targetSnake = snake.head; // Target the head of the smaller snake
      }
    }
  }

  let preferredMove = null;

  if (targetSnake) {
    // Go after the smaller snake
    let shortestDistance = Infinity;
    for (const move of safeMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      const dist = distance(nextCoord, targetSnake);
      if (dist < shortestDistance) {
        shortestDistance = dist;
        preferredMove = move;
      }
    }
  } else if (targetFood) {
    // Go after food
    let shortestDistance = Infinity;
    for (const move of safeMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      const dist = distance(nextCoord, targetFood);
      if (dist < shortestDistance) {
        shortestDistance = dist;
        preferredMove = move;
      }
    }
  }

  // If no clear target, make a random safe move
  if (!preferredMove) {
    preferredMove = safeMoves.length > 0 ? safeMoves[Math.floor(Math.random() * safeMoves.length)] : 'up';
  }

  console.log('MOVE:', preferredMove);
  response.status(200).send({ move: preferredMove });
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
