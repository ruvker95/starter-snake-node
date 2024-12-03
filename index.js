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
    color: '#8B0000', // Aggressive red color
    head: 'fang',     // Aggressive head
    tail: 'pixel'     // Sharp tail
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

  // Strategy: prioritize based on nearby snakes
  let target = null;
  let preferredMove = null;

  // Check nearby snakes to decide behavior
  let smallerSnakes = board.snakes.filter(snake => snake.id !== mySnake.id && snake.length < myLength);
  let biggerSnakes = board.snakes.filter(snake => snake.id !== mySnake.id && snake.length >= myLength);

  if (smallerSnakes.length > 0) {
    // Be aggressive toward smaller snakes
    let closestSmallSnake = smallerSnakes.reduce((closest, snake) => {
      const dist = distance(myHead, snake.head);
      return dist < distance(myHead, closest.head) ? snake : closest;
    }, smallerSnakes[0]);

    target = closestSmallSnake.head;

    let shortestDistance = Infinity;
    for (const move of safeMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      const dist = distance(nextCoord, target);
      if (dist < shortestDistance) {
        shortestDistance = dist;
        preferredMove = move;
      }
    }
  } else if (biggerSnakes.length > 0) {
    // Be defensive and avoid big snakes, prioritize food
    let closestBigSnake = biggerSnakes.reduce((closest, snake) => {
      const dist = distance(myHead, snake.head);
      return dist < distance(myHead, closest.head) ? snake : closest;
    }, biggerSnakes[0]);

    // Move away from the closest big snake
    safeMoves.sort((a, b) => {
      const distA = distance(moveAsCoord(a, myHead), closestBigSnake.head);
      const distB = distance(moveAsCoord(b, myHead), closestBigSnake.head);
      return distB - distA;
    });
    preferredMove = safeMoves[0];
  }

  if (!preferredMove) {
    // Default to food-seeking if no snake targets
    let targetFood = null;
    for (const food of board.food) {
      if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
        targetFood = food;
      }
    }

    if (targetFood) {
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
  }

  // Random fallback if no other decision
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
