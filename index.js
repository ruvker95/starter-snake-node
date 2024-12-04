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
    color: '#660033', // Dark red - #660033
    head: 'workout',     // workout
    tail: 'sharp'    // sharp
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

  // Determine the closest food
  let targetFood = null;
  for (const food of board.food) {
    if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
      targetFood = food;
    }
  }

  // Check for nearby snakes going after the same food
  for (const snake of board.snakes) {
    if (snake.id !== mySnake.id) {
      const distToFood = distance(snake.head, targetFood);
      const myDistToFood = distance(myHead, targetFood);

      if (distToFood <= myDistToFood && distToFood <= 2) {
        // Switch to the next closest food if another snake is close to the same target
        targetFood = null;
        for (const food of board.food) {
          if (
            !coordEqual(food, targetFood) && 
            (!targetFood || distance(myHead, food) < distance(myHead, targetFood))
          ) {
            targetFood = food;
          }
        }
        break;
      }
    }
  }

  // Choose the best move towards the target
  let target = targetFood || myHead; // Default to staying in place if no target
  let bestMove = null;
  let shortestDistance = Infinity;

  for (const move of possibleMoves) {
    const nextCoord = moveAsCoord(move, myHead);
    if (!isSafe(board, mySnake, nextCoord)) continue;
    const dist = distance(nextCoord, target);
    if (dist < shortestDistance) {
      shortestDistance = dist;
      bestMove = move;
    }
  }

  if (bestMove) {
    console.log('MOVE:', bestMove);
    response.status(200).send({ move: bestMove });
  } else {
    // Default to any move that doesn't go off board or collide with self
    console.log('No best move found, defaulting to safe move.');
    for (const move of possibleMoves) {
      const nextCoord = moveAsCoord(move, myHead);
      if (!offBoard(board, nextCoord) && !snakeHitSelfQuestionMark(mySnake, nextCoord)) {
        response.status(200).send({ move });
        return;
      }
    }
  }
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

function snakeHitSelfQuestionMark(mySnake, coord) {
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment)) return true;
  }
  return false;
}

function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}
