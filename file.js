// Game Configuration
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const GRID_SIZE = 10;
const INITIAL_SNAKE_LENGTH = 3;

// Game Settings
let gameSettings = {
    difficulty: 'normal',
    volume: 0.7,
    gameSpeed: 1,
    aiSnakeCount: 5,
    soundEnabled: true,
    particlesEnabled: true
};

// Game State
let gameState = {
    isRunning: false,
    isPaused: false,
    gameMode: 'survival',
    score: 0,
    highScore: localStorage.getItem('highScore') || 0,
    timeElapsed: 0,
    tournamentRound: 0,
    roundScores: [0, 0, 0]
};

let currentGameMode = 'survival';
let playerSnake = null;
let aiSnakes = [];
let powerUps = [];
let particles = [];

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Sound Manager
class SoundManager {
    constructor() {
        this.sounds = {};
        this.muted = false;
    }

    playSound(type) {
        if (!gameSettings.soundEnabled || this.muted) return;

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioContext.currentTime;

        switch(type) {
            case 'eat':
                this.playTone(audioContext, 800, 0.1, now);
                break;
            case 'powerup':
                this.playTone(audioContext, 1200, 0.15, now);
                break;
            case 'collision':
                this.playTone(audioContext, 300, 0.1, now);
                break;
        }
    }

    playTone(audioContext, frequency, duration, startTime) {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();

        osc.connect(gain);
        gain.connect(audioContext.destination);

        osc.frequency.value = frequency;
        gain.gain.setValueAtTime(gameSettings.volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }
}

const soundManager = new SoundManager();

// Particle System
class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4 - 2;
        this.life = 1;
        this.decay = Math.random() * 0.02 + 0.02;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // gravity
        this.life -= this.decay;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

// Power-up Class
class PowerUp {
    constructor() {
        this.x = Math.random() * (CANVAS_WIDTH / GRID_SIZE) * GRID_SIZE;
        this.y = Math.random() * (CANVAS_HEIGHT / GRID_SIZE) * GRID_SIZE;
        this.type = ['speedBoost', 'shield', 'freeze', 'shrink'][Math.floor(Math.random() * 4)];
        this.duration = 5000; // 5 seconds
        this.radius = GRID_SIZE / 2;
    }

    draw() {
        const icons = {
            speedBoost: '⭐',
            shield: '🛡️',
            freeze: '❄️',
            shrink: '📉'
        };

        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icons[this.type], this.x + GRID_SIZE / 2, this.y + GRID_SIZE / 2);
    }

    isColliding(snakeHead) {
        const dx = this.x + GRID_SIZE / 2 - snakeHead.x - GRID_SIZE / 2;
        const dy = this.y + GRID_SIZE / 2 - snakeHead.y - GRID_SIZE / 2;
        return Math.sqrt(dx * dx + dy * dy) < GRID_SIZE;
    }
}

// Snake Class
class Snake {
    constructor(x, y, isPlayer = false) {
        this.body = [];
        this.direction = { x: 1, y: 0 };
        this.nextDirection = { x: 1, y: 0 };
        this.isPlayer = isPlayer;
        this.speed = 5 + (gameSettings.gameSpeed - 1) * 2;
        this.color = isPlayer ? '#667eea' : this.getRandomColor();
        this.score = 0;
        this.shield = false;
        this.speedBoost = false;
        this.frozen = false;
        this.shrunken = false;
        this.activeEffects = {};

        // Initialize body
        for (let i = INITIAL_SNAKE_LENGTH - 1; i >= 0; i--) {
            this.body.push({
                x: x + i * GRID_SIZE,
                y: y,
                width: GRID_SIZE,
                height: GRID_SIZE
            });
        }
    }

    getRandomColor() {
        const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe'];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    update() {
        if (!this.frozen) {
            this.direction = this.nextDirection;

            // Move head
            const head = this.body[0];
            const newHead = {
                x: head.x + this.direction.x * this.speed,
                y: head.y + this.direction.y * this.speed,
                width: GRID_SIZE,
                height: GRID_SIZE
            };

            // Wrap around edges
            if (newHead.x < 0) newHead.x = CANVAS_WIDTH - GRID_SIZE;
            if (newHead.x >= CANVAS_WIDTH) newHead.x = 0;
            if (newHead.y < 0) newHead.y = CANVAS_HEIGHT - GRID_SIZE;
            if (newHead.y >= CANVAS_HEIGHT) newHead.y = 0;

            this.body.unshift(newHead);

            // Remove tail if not growing
            if (this.body.length > 0 && !this.isGrowing) {
                this.body.pop();
            }
            this.isGrowing = false;
        }
    }

    grow(amount = 1) {
        for (let i = 0; i < amount; i++) {
            this.isGrowing = true;
        }
        this.score += 10 * amount;
    }

    setNextDirection(dx, dy) {
        // Prevent 180-degree turns
        if (this.direction.x === -dx || this.direction.y === -dy) return;
        this.nextDirection = { x: dx, y: dy };
    }

    draw() {
        // Draw body
        this.body.forEach((segment, index) => {
            if (index === 0) {
                // Head with gradient
                const gradient = ctx.createLinearGradient(segment.x, segment.y, segment.x + segment.width, segment.y + segment.height);
                gradient.addColorStop(0, this.color);
                gradient.addColorStop(1, this.adjustBrightness(this.color, -30));
                ctx.fillStyle = gradient;
            } else {
                ctx.fillStyle = this.adjustBrightness(this.color, -(index * 2));
            }

            ctx.fillRect(segment.x, segment.y, segment.width, segment.height);

            // Border
            ctx.strokeStyle = this.adjustBrightness(this.color, -50);
            ctx.lineWidth = 2;
            ctx.strokeRect(segment.x, segment.y, segment.width, segment.height);
        });

        // Draw eyes on head
        const head = this.body[0];
        ctx.fillStyle = 'white';
        ctx.beginPath();
        if (this.direction.x > 0) {
            ctx.arc(head.x + GRID_SIZE - 3, head.y + 3, 2, 0, Math.PI * 2);
            ctx.arc(head.x + GRID_SIZE - 3, head.y + GRID_SIZE - 3, 2, 0, Math.PI * 2);
        } else if (this.direction.x < 0) {
            ctx.arc(head.x + 3, head.y + 3, 2, 0, Math.PI * 2);
            ctx.arc(head.x + 3, head.y + GRID_SIZE - 3, 2, 0, Math.PI * 2);
        } else if (this.direction.y > 0) {
            ctx.arc(head.x + 3, head.y + GRID_SIZE - 3, 2, 0, Math.PI * 2);
            ctx.arc(head.x + GRID_SIZE - 3, head.y + GRID_SIZE - 3, 2, 0, Math.PI * 2);
        } else {
            ctx.arc(head.x + 3, head.y + 3, 2, 0, Math.PI * 2);
            ctx.arc(head.x + GRID_SIZE - 3, head.y + 3, 2, 0, Math.PI * 2);
        }
        ctx.fill();

        // Draw shield if active
        if (this.shield) {
            ctx.strokeStyle = '#4ecdc4';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(head.x + GRID_SIZE / 2, head.y + GRID_SIZE / 2, GRID_SIZE, 0, Math.PI * 2);
            ctx.stroke();
        }

        // Draw shrink effect
        if (this.shrunken) {
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = '#f0f0f0';
            ctx.fillRect(head.x - 5, head.y - 5, GRID_SIZE + 10, GRID_SIZE + 10);
            ctx.globalAlpha = 1;
        }
    }

    adjustBrightness(color, amount) {
        const num = parseInt(color.replace('#', ''), 16);
        const r = Math.max(0, Math.min(255, (num >> 16) + amount));
        const g = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amount));
        const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
        return '#' + (r << 16 | g << 8 | b).toString(16).padStart(6, '0');
    }

    getHeadPosition() {
        return this.body[0];
    }

    getSize() {
        return this.body.length;
    }

    applyPowerUp(type) {
        soundManager.playSound('powerup');

        switch(type) {
            case 'speedBoost':
                this.speed = 15;
                setTimeout(() => { this.speed = 5 + (gameSettings.gameSpeed - 1) * 2; }, 5000);
                break;
            case 'shield':
                this.shield = true;
                setTimeout(() => { this.shield = false; }, 5000);
                break;
            case 'freeze':
                aiSnakes.forEach(snake => {
                    snake.frozen = true;
                    setTimeout(() => { snake.frozen = false; }, 5000);
                });
                break;
            case 'shrink':
                this.shrunken = true;
                setTimeout(() => { this.shrunken = false; }, 5000);
                break;
        }
    }
}

// AI Snake Class (extends Snake)
class AISnake extends Snake {
    constructor(x, y) {
        super(x, y, false);
        this.moveCounter = 0;
        this.targetSnake = null;
    }

    aiUpdate() {
        this.moveCounter++;

        if (this.moveCounter % 10 === 0) {
            // Find nearest snake to chase or flee from
            let nearestSnake = null;
            let minDistance = Infinity;

            const allSnakes = [playerSnake, ...aiSnakes].filter(s => s !== this);

            allSnakes.forEach(snake => {
                const head = this.getHeadPosition();
                const otherHead = snake.getHeadPosition();
                const distance = Math.hypot(head.x - otherHead.x, head.y - otherHead.y);

                if (distance < minDistance) {
                    minDistance = distance;
                    nearestSnake = snake;
                }
            });

            if (nearestSnake) {
                const head = this.getHeadPosition();
                const targetHead = nearestSnake.getHeadPosition();
                const shouldChase = this.getSize() > nearestSnake.getSize();

                if (shouldChase) {
                    // Chase smaller snake
                    const dx = targetHead.x - head.x;
                    const dy = targetHead.y - head.y;

                    if (Math.abs(dx) > Math.abs(dy)) {
                        this.setNextDirection(dx > 0 ? 1 : -1, 0);
                    } else {
                        this.setNextDirection(0, dy > 0 ? 1 : -1);
                    }
                } else {
                    // Flee from larger snake
                    const dx = head.x - targetHead.x;
                    const dy = head.y - targetHead.y;

                    if (Math.abs(dx) > Math.abs(dy)) {
                        this.setNextDirection(dx > 0 ? 1 : -1, 0);
                    } else {
                        this.setNextDirection(0, dy > 0 ? 1 : -1);
                    }
                }
            } else {
                // Random movement
                const random = Math.random();
                if (random < 0.25) this.setNextDirection(1, 0);
                else if (random < 0.5) this.setNextDirection(-1, 0);
                else if (random < 0.75) this.setNextDirection(0, 1);
                else this.setNextDirection(0, -1);
            }
        }

        this.update();
    }
}

// Collision Detection
function checkCollisions() {
    // Check player snake collisions with other snakes
    const playerHead = playerSnake.getHeadPosition();

    aiSnakes.forEach((aiSnake, index) => {
        // Check if player eats AI snake
        aiSnake.body.forEach(segment => {
            if (playerHead.x === segment.x && playerHead.y === segment.y) {
                soundManager.playSound('eat');
                playerSnake.grow(aiSnake.getSize());
                gameState.score += aiSnake.getSize() * 50;
                
                if (gameSettings.particlesEnabled) {
                    for (let i = 0; i < 10; i++) {
                        particles.push(new Particle(segment.x, segment.y, aiSnake.color));
                    }
                }

                // Remove eaten snake and spawn new one
                aiSnakes.splice(index, 1);
                spawnAISnake();
            }
        });

        // Check if AI snake eats player
        const aiHead = aiSnake.getHeadPosition();
        playerSnake.body.forEach((segment, segIndex) => {
            if (aiHead.x === segment.x && aiHead.y === segment.y && segIndex > 2) {
                if (playerSnake.shield) {
                    playerSnake.shield = false;
                    soundManager.playSound('collision');
                } else {
                    endGame();
                }
            }
        });

        // Check if AI snakes eat each other
        aiSnakes.forEach((otherSnake, otherIndex) => {
            if (index !== otherIndex) {
                otherSnake.body.forEach(segment => {
                    if (aiHead.x === segment.x && aiHead.y === segment.y) {
                        if (aiSnake.getSize() > otherSnake.getSize()) {
                            aiSnake.grow(otherSnake.getSize());
                            aiSnakes.splice(otherIndex, 1);
                        }
                    }
                });
            }
        });
    });

    // Check power-up collisions
    powerUps.forEach((powerUp, index) => {
        if (powerUp.isColliding(playerHead)) {
            playerSnake.applyPowerUp(powerUp.type);
            powerUps.splice(index, 1);
        }
    });

    // Player self-collision
    for (let i = 1; i < playerSnake.body.length; i++) {
        if (playerHead.x === playerSnake.body[i].x && playerHead.y === playerSnake.body[i].y) {
            if (playerSnake.shield) {
                playerSnake.shield = false;
            } else {
                endGame();
            }
        }
    }
}

// Spawn functions
function spawnAISnake() {
    const x = Math.random() * (CANVAS_WIDTH - GRID_SIZE);
    const y = Math.random() * (CANVAS_HEIGHT - GRID_SIZE);
    aiSnakes.push(new AISnake(x, y));
}

function spawnPowerUp() {
    if (Math.random() < 0.01 && powerUps.length < 5) {
        powerUps.push(new PowerUp());
    }
}

// Game Loop
function gameLoop() {
    if (!gameState.isRunning) return;

    if (gameState.isPaused) {
        requestAnimationFrame(gameLoop);
        return;
    }

    // Update game time
    gameState.timeElapsed += 16; // ~60 FPS

    // Update entities
    playerSnake.update();
    aiSnakes.forEach(snake => snake.aiUpdate());
    particles.forEach(particle => particle.update());

    // Remove dead particles
    particles = particles.filter(p => p.life > 0);

    // Spawn power-ups
    spawnPowerUp();

    // Check collisions
    checkCollisions();

    // Clear canvas
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= CANVAS_WIDTH; x += GRID_SIZE * 5) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, CANVAS_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y += GRID_SIZE * 5) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(CANVAS_WIDTH, y);
        ctx.stroke();
    }

    // Draw entities
    playerSnake.draw();
    aiSnakes.forEach(snake => snake.draw());
    powerUps.forEach(powerUp => powerUp.draw());
    particles.forEach(particle => particle.draw());

    // Update UI
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('snakeSize').textContent = playerSnake.getSize();

    // Time attack mode
    if (gameState.gameMode === 'timed') {
        const remainingTime = Math.max(0, 60 - Math.floor(gameState.timeElapsed / 1000));
        document.getElementById('timer').textContent = remainingTime;

        if (remainingTime === 0) {
            endGame();
        }
    }

    requestAnimationFrame(gameLoop);
}

// Game Control Functions
function startGame(mode) {
    currentGameMode = mode;
    gameState.gameMode = mode;
    gameState.isRunning = true;
    gameState.isPaused = false;
    gameState.score = 0;
    gameState.timeElapsed = 0;
    playerSnake = null;
    aiSnakes = [];
    powerUps = [];
    particles = [];

    // Hide menu, show game
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('settingsMenu').classList.remove('active');
    document.getElementById('instructionsMenu').classList.remove('active');
    document.getElementById('gameScreen').classList.add('active');
    document.getElementById('pauseMenu').classList.remove('active');
    document.getElementById('gameOverMenu').classList.remove('active');

    // Show/hide timer based on mode
    if (mode === 'timed') {
        document.getElementById('timerBox').style.display = 'flex';
    } else {
        document.getElementById('timerBox').style.display = 'none';
    }

    // Create player snake
    playerSnake = new Snake(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, true);

    // Spawn AI snakes
    for (let i = 0; i < gameSettings.aiSnakeCount; i++) {
        const x = Math.random() * (CANVAS_WIDTH - GRID_SIZE);
        const y = Math.random() * (CANVAS_HEIGHT - GRID_SIZE);
        aiSnakes.push(new AISnake(x, y));
    }

    gameLoop();
}

function endGame() {
    gameState.isRunning = false;

    // Update high score
    if (gameState.score > gameState.highScore) {
        gameState.highScore = gameState.score;
        localStorage.setItem('highScore', gameState.highScore);
        document.getElementById('highScore').textContent = gameState.highScore;
    }

    // Show game over menu
    document.getElementById('finalScore').textContent = gameState.score;
    document.getElementById('snakesEaten').textContent = aiSnakes.length;
    document.getElementById('finalSize').textContent = playerSnake.getSize();
    document.getElementById('timeSurvived').textContent = Math.floor(gameState.timeElapsed / 1000);

    document.getElementById('gameOverMenu').classList.add('active');
}

function togglePause() {
    gameState.isPaused = !gameState.isPaused;

    if (gameState.isPaused) {
        document.getElementById('pauseMenu').classList.add('active');
    } else {
        document.getElementById('pauseMenu').classList.remove('active');
    }
}

function backToMenu() {
    document.getElementById('mainMenu').classList.add('active');
    document.getElementById('settingsMenu').classList.remove('active');
    document.getElementById('instructionsMenu').classList.remove('active');
}

// Settings Functions
function showSettings() {
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('settingsMenu').classList.add('active');
}

function showInstructions() {
    document.getElementById('mainMenu').classList.remove('active');
    document.getElementById('instructionsMenu').classList.add('active');
}

function changeDifficulty(level) {
    gameSettings.difficulty = level;
    const speedMap = { easy: 0.7, normal: 1, hard: 1.3 };
    gameSettings.gameSpeed = speedMap[level];
}

function changeVolume(value) {
    gameSettings.volume = value / 100;
    document.getElementById('volumeValue').textContent = value + '%';
}

function changeSpeed(value) {
    gameSettings.gameSpeed = value / 100;
    document.getElementById('speedValue').textContent = value + '%';
}

function changeSnakeCount(value) {
    gameSettings.aiSnakeCount = parseInt(value);
    document.getElementById('snakesValue').textContent = value;
}

function toggleSound() {
    gameSettings.soundEnabled = !gameSettings.soundEnabled;
}

function toggleParticles() {
    gameSettings.particlesEnabled = !gameSettings.particlesEnabled;
}

function saveSettings() {
    backToMenu();
}

// Keyboard Controls
document.addEventListener('keydown', (e) => {
    if (!gameState.isRunning || !playerSnake) return;

    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            playerSnake.setNextDirection(0, -1);
            e.preventDefault();
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            playerSnake.setNextDirection(0, 1);
            e.preventDefault();
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            playerSnake.setNextDirection(-1, 0);
            e.preventDefault();
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            playerSnake.setNextDirection(1, 0);
            e.preventDefault();
            break;
        case 'p':
        case 'P':
            togglePause();
            break;
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('highScore').textContent = gameState.highScore;
});
