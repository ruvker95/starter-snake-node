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
    author: 'stevemar',
    color: '#8B0000', // Dark red
    head: 'fang',     // Aggressive head
    tail: 'ice-skate'    // Funny tail
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
  // Determine the closest smaller snake
  let targetSnake = null;
  for (const snake of board.snakes) {
    console.log("Checking snake" + snake.id)
    if (snake.id !== mySnake.id && snake.length < myLength) {
      if (!targetSnake || distance(myHead, snake.head) < distance(myHead, targetSnake.head)) {
        targetSnake = snake;
      }
    }
  }
  // Determine the closest food
  let targetFood = null;
  for (const food of board.food) {
    if (!targetFood || distance(myHead, food) < distance(myHead, targetFood)) {
      targetFood = food;
    }
  }
  // Decide movement target
  let target = null;
  if (targetSnake) {
    target = targetSnake.head; // Attack smaller snake
  } else if (targetFood) {
    target = targetFood; // Go for food
  }
  if (!target) {
    // Default to a safe move if no target
    response.status(200).send({ move: possibleMoves[0] });
    return;
  }
  // Choose the best move towards the target
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
    // No safe moves
    console.log('MOVE: down (default)');
    response.status(200).send({ move: 'down' });
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
  return coord.x <= 0 || coord.y <= 0 || coord.x >= board.width || coord.y >= board.height;
}
function isSafe(board, mySnake, coord) {
  // Avoid walls
  if (offBoard(board, coord)) return false;
  // Avoid self
  for (const segment of mySnake.body) {
    if (coordEqual(coord, segment)) return false;
  }
  // Avoid other snakes
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
function handleEnd(request, response) {
  console.log('END');
  response.status(200).send('ok');
}