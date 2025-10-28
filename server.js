import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint de test pour vérifier que le serveur fonctionne
app.get('/test', (req, res) => {
  res.json({ 
    message: 'Serveur fonctionne !',
    timestamp: new Date().toISOString(),
    websocket: 'wss://serveur.kotaciv.com'
  });
});

app.get('/', (req, res) => {
  res.json({ 
    message: 'Serveur Jeu 2 Multijoueur',
    status: 'En ligne',
    websocket: 'wss://serveur.kotaciv.com'
  });
});

const PORT = process.env.PORT || 3002;

// Pour cPanel : écouter sur 0.0.0.0 et le port spécifié
const HOST = process.env.HOST || '0.0.0.0';

const server = app.listen(PORT, HOST, () => {
  console.log(`Serveur Jeu 2 démarré sur ${HOST}:${PORT}`);
});

const wss = new WebSocketServer({ 
  server,
  perMessageDeflate: false
});

let client1 = null;
let client2 = null;
let secretNumber = null;
let gameInProgress = false;

wss.on('connection', (ws) => {
  console.log('Nouveau client connecté');

  if (!client1) {
    client1 = ws;
    ws.clientType = 'client1';
    ws.send(JSON.stringify({
      type: 'role',
      role: 'client1',
      message: 'Vous êtes le Client 1. Veuillez proposer un nombre entre 0 et 100.'
    }));
    console.log('Client 1 connecté');
  } else if (!client2) {
    client2 = ws;
    ws.clientType = 'client2';
    ws.send(JSON.stringify({
      type: 'role',
      role: 'client2',
      message: 'Vous êtes le Client 2. En attente du nombre proposé par le Client 1...'
    }));
    console.log('Client 2 connecté');

    if (client1) {
      client1.send(JSON.stringify({
        type: 'info',
        message: 'Client 2 connecté. Vous pouvez proposer un nombre.'
      }));
    }
  } else {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Partie déjà complète. Deux clients sont déjà connectés.'
    }));
    ws.close();
    return;
  }

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'setNumber' && ws.clientType === 'client1') {
        const number = parseInt(message.number);

        if (isNaN(number) || number < 0 || number > 100) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Erreur: Le nombre doit être entre 0 et 100'
          }));
          return;
        }

        secretNumber = number;
        gameInProgress = true;
        console.log(`Client 1 a choisi le nombre: ${secretNumber}`);

        client1.send(JSON.stringify({
          type: 'success',
          message: `Nombre ${secretNumber} enregistré. En attente des propositions du Client 2...`
        }));

        if (client2) {
          client2.send(JSON.stringify({
            type: 'start',
            message: 'Le Client 1 a choisi un nombre. Devinez le nombre entre 0 et 100!'
          }));
        }
      } else if (message.type === 'guess' && ws.clientType === 'client2') {
        if (!gameInProgress || secretNumber === null) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Le jeu n\'a pas encore commencé. En attente du Client 1.'
          }));
          return;
        }

        const guess = parseInt(message.number);

        if (isNaN(guess) || guess < 0 || guess > 100) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Erreur: Le nombre doit être entre 0 et 100'
          }));
          return;
        }

        let response;
        let responseType;

        if (guess > secretNumber) {
          response = 'Grand';
          responseType = 'hint';
        } else if (guess < secretNumber) {
          response = 'Petit';
          responseType = 'hint';
        } else {
          response = 'Bravo';
          responseType = 'success';
          gameInProgress = false;
        }

        client2.send(JSON.stringify({
          type: responseType,
          message: response,
          guess: guess
        }));

        if (client1) {
          client1.send(JSON.stringify({
            type: 'opponent_guess',
            guess: guess,
            result: response
          }));
        }

        if (responseType === 'success') {
          setTimeout(() => {
            if (client1) {
              client1.send(JSON.stringify({
                type: 'game_over',
                message: 'Le Client 2 a trouvé votre nombre!'
              }));
            }
          }, 500);
        }
      } else if (message.type === 'setNumber' && ws.clientType === 'client2') {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Vous êtes le Client 2, vous devez deviner le nombre, pas le proposer.'
        }));
      } else if (message.type === 'guess' && ws.clientType === 'client1') {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Vous êtes le Client 1, vous proposez le nombre, vous ne devinez pas.'
        }));
      }
    } catch (error) {
      console.error('Erreur:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Erreur lors du traitement de votre message'
      }));
    }
  });

  ws.on('close', () => {
    console.log(`Client ${ws.clientType} déconnecté`);

    if (ws === client1) {
      client1 = null;
      if (client2) {
        client2.send(JSON.stringify({
          type: 'info',
          message: 'Client 1 déconnecté. Partie terminée.'
        }));
      }
    } else if (ws === client2) {
      client2 = null;
      if (client1) {
        client1.send(JSON.stringify({
          type: 'info',
          message: 'Client 2 déconnecté. Partie terminée.'
        }));
      }
    }

    secretNumber = null;
    gameInProgress = false;
  });
});
