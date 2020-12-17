const bodyParser = require('body-parser')
const express = require('express')

const PORT = process.env.PORT || 3000

const app = express()
app.use(bodyParser.json())

app.get('/', handleIndex)
app.post('/start', handleStart)
app.post('/move', handleMove)
app.post('/end', handleEnd)

app.listen(PORT, () => console.log(`Battlesnake Server listening at http://127.0.0.1:${PORT}`))


function handleIndex(request, response) {
  var battlesnakeInfo = {
    apiversion: '1',
    author: 'stevemar',
    color: '#006699',
    head: 'bwc-ski',
    tail: 'sharp'
  }
  response.status(200).json(battlesnakeInfo)
}

function handleStart(request, response) {
  var gameData = request.body

  console.log('START')
  console.log(gameData)
  response.status(200).send('ok')
}

function handleMove(request, response) {
  var gameData = request.body;
  console.log(gameData);

  const head = gameData.you.head; // example return: { x: 10, y: 1 }
  const neck = gameData.you.body[1];

  var possibleMoves = ['up', 'left', 'down', 'right']
  for (const m of possibleMoves) {
    const coord = moveAsCoord(m, head);
    if (!offBoard(gameData, coord) && !coordEqual(coord, neck)) {
        console.log('MOVE: ' + m)
        response.status(200).send({move: m})
    }
  }
}

function moveAsCoord(move, head) {
  switch (move) {
    case 'up':
      return {x: head.x, y: head.y+1};
    case 'down':
      return {x: head.x, y: head.y-1};
    case 'left':
      return {x: head.x-1, y: head.y};
    case 'right':
      return {x: head.x+1, y: head.y};
  }
}

function offBoard(gameData, coord) {
  if (coord.x < 0) return true;
  if (coord.y < 0) return true;
  if (coord.y >= gameData.board.height) return true;
  if (coord.x >= gameData.board.height) return true;
  return false; // If it makes it here we are ok.
}

function coordEqual(a, b) {
  return a.x === b.x && a.y === b.y;
}

function handleEnd(request, response) {
  console.log('END')
  response.status(200).send('ok')
}
