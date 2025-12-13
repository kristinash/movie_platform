import { io } from 'socket.io-client';
import readline from 'readline';

class MoviePartyClient {
  constructor() {
    this.socket = null;
    this.currentRoom = null;
    this.username = '';
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    this.isMenuActive = false;
    this.currentMenu = null;
    this.isInitialSync = false;
  }

  async connect() {
    this.socket = io('http://localhost:3000');

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.promptUsername();
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      this.cleanup();
    });

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.socket.on('chat-message', (data) => {
      console.log(`[${data.timestamp}] ${data.username}: ${data.message}`);
      this.showCurrentMenu();
    });

    this.socket.on('playback-update', (data) => {
      if (data.isSync && this.isInitialSync) {
        this.isInitialSync = false; 
      } else if (data.isSync) {
        console.log(`Video synced to ${data.timestamp}s`);
      } else {
        console.log(`${data.username} ${data.action} at ${data.timestamp}s`);
      }
      this.showCurrentMenu();
    });

    this.socket.on('user-joined', (data) => {
      console.log(`${data.username} joined the room`);
      console.log(`Users in room: ${data.users.map(u => u.username).join(', ')}`);
      this.showCurrentMenu();
    });

    this.socket.on('user-left', (data) => {
      console.log(`${data.username} left the room`);
      console.log(`Users in room: ${data.users.map(u => u.username).join(', ')}`);
      this.showCurrentMenu();
    });

    this.socket.on('room-created', (data) => {
      console.log(`Room "${data.roomId}" created successfully!`);
      console.log(`Video state: ${data.videoState.playing ? 'Playing' : 'Paused'} at ${data.videoState.timestamp}s`);
      this.showRoomHistory(data);
      this.roomMenu();
    });

    this.socket.on('room-joined', (data) => {
      console.log(`Joined room "${data.roomId}" successfully!`);
      this.showRoomHistory(data);
    
      this.isInitialSync = true;
      
      if (data.videoState.lastAction !== 'sync') {
        this.socket.emit('video-control', {
          roomId: this.currentRoom,
          action: 'sync',
          timestamp: data.videoState.timestamp,
          username: this.username
        });
      }
      
      this.roomMenu();
    });

    this.socket.on('room-error', (data) => {
      console.log(`Error: ${data.message}`);
      this.currentRoom = null; 
      setTimeout(() => {
        this.showMainMenu();
      }, 100);
    });

    this.socket.on('room-state', (data) => {
      this.showRoomHistory(data);
    });
  }

  showRoomHistory(data) {
    if (data.messages && data.messages.length > 0) {
      console.log('Chat history:');
      data.messages.forEach(msg => {
        console.log(`[${msg.timestamp}] ${msg.username}: ${msg.message}`);
      });
    }
    
    console.log(`Current video: ${data.videoState.playing ? 'Playing' : 'Paused'} at ${data.videoState.timestamp}s`);
    console.log(`Users in room: ${data.users.map(u => u.username).join(', ')}`);
  }

  showCurrentMenu() {
    if (this.isMenuActive && this.currentMenu) {
      process.stdout.write('\n');
      this.currentMenu();
    }
  }

  promptUsername() {
    this.isMenuActive = true;
    this.currentMenu = null;
    this.rl.question('Enter your username: ', (username) => {
      this.username = username;
      this.showMainMenu();
    });
  }

  showMainMenu() {
    this.isMenuActive = true;
    this.currentMenu = this.showMainMenu.bind(this);
    
    console.log('\n=== Movie Party Platform ===');
    console.log('1. Create room');
    console.log('2. Join room');
    console.log('3. Exit');
    
    this.rl.question('Choose option (1-3): ', (choice) => {
      switch(choice) {
        case '1':
          this.createRoom();
          break;
        case '2':
          this.joinRoom();
          break;
        case '3':
          this.cleanup();
          break;
        default:
          console.log('Invalid choice!');
          this.showMainMenu();
      }
    });
  }

  createRoom() {
    this.isMenuActive = true;
    this.currentMenu = null;
    
    this.rl.question('Enter room ID: ', (roomId) => {
      this.currentRoom = roomId;
      this.socket.emit('create-room', { 
        roomId: this.currentRoom, 
        username: this.username 
      });
    });
  }

  joinRoom() {
    this.isMenuActive = true;
    this.currentMenu = null;
    
    this.rl.question('Enter room ID to join: ', (roomId) => {
      this.currentRoom = roomId;
      this.socket.emit('join-room', { 
        roomId: this.currentRoom, 
        username: this.username 
      });
    });
  }

  roomMenu() {
    this.isMenuActive = true;
    this.currentMenu = this.roomMenu.bind(this);
    
    console.log(`\n=== Room: ${this.currentRoom} ===`);
    console.log('1. Send message');
    console.log('2. Video control');
    console.log('3. Leave room');
    
    this.rl.question('Choose option (1-3): ', (choice) => {
      switch(choice) {
        case '1':
          this.sendMessage();
          break;
        case '2':
          this.videoControl();
          break;
        case '3':
          this.leaveRoom();
          break;
        default:
          console.log('Invalid choice!');
          this.roomMenu();
      }
    });
  }

  sendMessage() {
    this.isMenuActive = true;
    this.currentMenu = null;
    
    this.rl.question('Enter your message: ', (message) => {
      this.socket.emit('chat-message', {
        roomId: this.currentRoom,
        message: message,
        username: this.username
      });
      this.roomMenu();
    });
  }

  videoControl() {
    this.isMenuActive = true;
    this.currentMenu = this.videoControl.bind(this);
    
    console.log('\n=== Video Controls ===');
    console.log('1. Play');
    console.log('2. Pause');
    console.log('3. Forward 10s');
    console.log('4. Back 10s');
    console.log('5. Back to room');
    
    this.rl.question('Choose option (1-5): ', (choice) => {
      let videoAction, timestamp;
      
      switch(choice) {
        case '1':
          videoAction = 'play';
          timestamp = 0;
          break;
        case '2':
          videoAction = 'pause';
          timestamp = 0;
          break;
        case '3':
          videoAction = 'seek';
          timestamp = 10;
          break;
        case '4':
          videoAction = 'seek';
          timestamp = -10;
          break;
        case '5':
          this.roomMenu();
          return;
        default:
          console.log('Invalid choice!');
          this.videoControl();
          return;
      }

      this.socket.emit('video-control', {
        roomId: this.currentRoom,
        action: videoAction,
        timestamp: timestamp,
        username: this.username
      });

      console.log(`Sent: ${videoAction}`);
      this.roomMenu();
    });
  }

  leaveRoom() {
    if (this.currentRoom) {
      this.socket.emit('leave-room', this.currentRoom);
      this.currentRoom = null;
    }
    this.isMenuActive = false;
    this.currentMenu = null;
    this.isInitialSync = false; 
    console.log('Left the room');
    this.showMainMenu();
  }

  cleanup() {
    if (this.socket) {
      this.socket.disconnect();
    }
    this.rl.close();
    process.exit();
  }
}

const client = new MoviePartyClient();
client.connect();