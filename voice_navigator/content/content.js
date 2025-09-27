if (!window.__voice_nav_injected__) {
  window.__voice_nav_injected__ = true;

  const btn = document.createElement("button");
  btn.textContent = "🎤 Voice Nav (off)";
  btn.id = "vn-btn";
  Object.assign(btn.style, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    padding: "10px 14px",
    fontSize: "14px",
    borderRadius: "8px",
    background: "#1f6feb",
    color: "white",
    border: "none",
    zIndex: "999999",
  });

  document.body.appendChild(btn);

  // Create Song Game button
  const gameBtn = document.createElement("button");
  gameBtn.textContent = "🎵 Song Game";
  gameBtn.id = "game-btn";
  Object.assign(gameBtn.style, {
    position: "fixed",
    right: "20px",
    bottom: "80px",
    padding: "10px 14px",
    fontSize: "14px",
    borderRadius: "8px",
    background: "#e74c3c",
    color: "white",
    border: "none",
    zIndex: "999999",
    cursor: "pointer",
  });

  document.body.appendChild(gameBtn);
  gameBtn.style.display = "none";

  btn.style.display = "none";

  window.__voice_nav_toggle = () => {
    const current = btn.style.display || getComputedStyle(btn).display;
    const gameCurrent = gameBtn.style.display || getComputedStyle(gameBtn).display;
    const show = current === "none";
    btn.style.display = show ? "block" : "none";
    gameBtn.style.display = show ? "block" : "none";
    if (!show) stopListening();
  };

  // ✅ called by SW after navigation to auto-resume
  window.__voice_nav_autostart = () => {
    btn.style.display = "block";
    gameBtn.style.display = "block";
    if (!listening && recognition) {
      listening = true;
      try {
        recognition.start();
        isRunning = true;
      } catch {}
    }
    btn.textContent = "🎤 Listening...";
    showCommandHint();
  };

  let listening = false;
  let recognition;

  function processVoiceCommand(transcript) {
    const cleaned = transcript
      .toLowerCase()
      .replace(/[.,!?]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const m = cleaned.match(/\bsearch(?: for)?\s+(.+)$/i);
    if (!m) return false;

    let query = m[1].trim();

    // target parsing
    let target = "current"; // default: same tab
    if (
      /\b(in|on)\s+(a\s+)?new\s+tab\b/.test(query) ||
      /\bnew\s+tab\b/.test(query)
    ) {
      target = "new";
      query = query
        .replace(/\b(in|on)\s+(a\s+)?new\s+tab\b/g, "")
        .replace(/\bnew\s+tab\b/g, "")
        .trim();
    } else if (/\b(here|this\s+tab|same\s+tab)\b/.test(query)) {
      target = "current";
      query = query.replace(/\b(here|this\s+tab|same\s+tab)\b/g, "").trim();
    }

    if (!query) return false;

    executeSearch(query, target);
    stopListening();
    return true;
  }

  function executeSearch(query, target = "current") {
    btn.textContent = `🔍 Searching: ${query}`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
      query
    )}`;

    chrome.runtime.sendMessage({
      type: "OPEN_SEARCH",
      url: searchUrl,
      target, // "current" or "new"
    });

    hideCommandHint();
    setTimeout(() => {
      btn.textContent = "🎤 Voice Nav (off)";
    }, 1200);
  }

  // (helper) add this to manage consistent stopping
  function stopListening() {
    if (recognition && listening) {
      recognition.stop();
      listening = false;
    }
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
      recognition.continuous = true; // keep listening for multiple phrases
      recognition.interimResults = true; // show live transcription
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      // Handle live transcription for voice navigation
      let finalTranscript = '';
      let interimTranscript = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Only process final results for voice commands
      if (finalTranscript) {
        processVoiceCommand(finalTranscript);
      }
    };

    recognition.onend = () => {
      hideCommandHint();
      if (listening) {
        // auto-restart while toggle is ON
        try {
          recognition.start();
        } catch (_) {}
        btn.textContent = "🎤 Listening...";
      } else if (!btn.textContent.includes("🔍 Searching:")) {
      btn.textContent = "🎤 Voice Nav (off)";
      }
    };
  } else {
    console.warn("SpeechRecognition API not supported in this browser.");
    btn.textContent = "⚠️ No STT";
  }

  btn.addEventListener("click", () => {
    if (!recognition) return;
    if (!listening) {
      listening = true;
      try {
        recognition.start();
        isRunning = true;
      } catch {}
      btn.textContent = "🎤 Listening...";
      showCommandHint();
      chrome.runtime.sendMessage({ type: "LISTENING_STATE", state: "ON" });
    } else {
      listening = false;
      try {
        recognition.stop();
      } catch {}
      btn.textContent = "🎤 Voice Nav (off)";
      hideCommandHint();
      chrome.runtime.sendMessage({ type: "LISTENING_STATE", state: "OFF" });
    }
  });

  // Show command hints
  function showCommandHint() {
    if (document.getElementById("voice-hint")) return;

    const hint = document.createElement("div");
    hint.id = "voice-hint";
    hint.innerHTML = `
      <div style="
        position: fixed;
        right: 20px;
        bottom: 80px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px;
        border-radius: 8px;
        font-size: 12px;
        z-index: 999998;
        max-width: 200px;
      ">
        <strong>Available Commands:</strong><br>
        • "search [your query]"<br>
        • "search for [your query]"
      </div>
    `;
    document.body.appendChild(hint);
  }

  // Hide command hints
  function hideCommandHint() {
    const hint = document.getElementById("voice-hint");
    if (hint) {
      hint.remove();
    }
  }

  // Song Game button click handler
  gameBtn.addEventListener("click", () => {
    startSongGame();
  });

  // Song Game functionality
  function startSongGame() {
    // Create game overlay
    const gameOverlay = document.createElement("div");
    gameOverlay.id = "song-game";
    gameOverlay.innerHTML = `
      <div style="
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 30px;
        border-radius: 15px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        z-index: 1000000;
        min-width: 400px;
        text-align: center;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      ">
        <h2 style="margin-bottom: 20px; font-size: 24px;">🎵 Song Game 🎵</h2>
          <div style="margin-bottom: 20px;">
            <p style="font-size: 16px; margin-bottom: 10px;">Song title must start with:</p>
            <div id="game-letter" style="
              font-size: 48px;
              font-weight: bold;
              background: rgba(255,255,255,0.2);
              padding: 20px;
              border-radius: 10px;
              margin: 10px 0;
            ">A</div>
            <p style="font-size: 12px; opacity: 0.8; margin-top: 5px;">(Sing any lyrics from the song)</p>
          </div>
        <div style="margin-bottom: 20px;">
          <button id="start-game-btn" style="
            background: #4CAF50;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin: 5px;
          ">🎤 Start Singing</button>
          <button id="submit-lyrics-btn" style="
            background: #2196F3;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin: 5px;
            display: none;
          ">✅ Submit Lyrics</button>
          <button id="skip-letter-btn" style="
            background: #FF9800;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin: 5px;
          ">⏭️ Skip Letter</button>
          <button id="close-game-btn" style="
            background: #f44336;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            margin: 5px;
          ">❌ Close</button>
        </div>
        <div id="game-status" style="font-size: 14px; opacity: 0.8;">
          Click "Start Singing" to begin the game!
        </div>
        <div id="live-transcript" style="
          font-size: 12px; 
          opacity: 0.7; 
          margin-top: 8px; 
          min-height: 20px;
          background: rgba(255,255,255,0.1);
          padding: 8px;
          border-radius: 4px;
          font-style: italic;
        "></div>
        <div id="listening-indicator" style="
          font-size: 11px;
          opacity: 0.6;
          margin-top: 4px;
          text-align: center;
        ">🎤 Listening...</div>
        <div id="game-instructions" style="font-size: 12px; opacity: 0.7; margin-top: 10px; max-width: 350px; line-height: 1.4;">
          <strong>How to play:</strong><br>
          • Sing any lyrics from a real song<br>
          • The song TITLE must start with the letter shown<br>
          • You have 30 seconds per round<br>
          • Click "Submit Lyrics" when ready to check<br>
          • Can't think of a song? Click "Skip Letter" (-2 points, max 2 skips)<br>
          • System recognizes songs from your singing!
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 15px; font-size: 14px;">
          <div id="game-score" style="color: #4CAF50; font-weight: bold;">Score: 0</div>
          <div id="game-streak" style="color: #FF9800; font-weight: bold;">Streak: 0</div>
        </div>
        <div id="game-timer" style="
          font-size: 18px;
          font-weight: bold;
          color: #ffeb3b;
          margin-top: 10px;
        ">30s</div>
      </div>
    `;

    document.body.appendChild(gameOverlay);

    // Game state
    let gameActive = false;
    let gameTimer = null;
    let timeLeft = 30;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let currentLetter = 'A';
    let originalOnResult = null;
    let score = 0;
    let round = 1;
    let streak = 0;
    let maxStreak = 0;
    let skipCount = 0;
    const maxSkips = 2;

    // Start game button
    document.getElementById('start-game-btn').addEventListener('click', () => {
      if (!gameActive) {
        beginGame();
      }
    });

    // Submit lyrics button
    document.getElementById('submit-lyrics-btn').addEventListener('click', () => {
      // Pause transcription updates
      transcriptionPaused = true;
      
      // Clear transcription state
      document.getElementById('live-transcript').textContent = '';
      document.getElementById('listening-indicator').textContent = '🎤 Processing...';
      currentLyrics = '';
      
      submitCurrentLyrics();
    });

    // Skip letter button
    document.getElementById('skip-letter-btn').addEventListener('click', () => {
      // Pause transcription updates
      transcriptionPaused = true;
      
      // Clear transcription state
      document.getElementById('live-transcript').textContent = '';
      document.getElementById('listening-indicator').textContent = '⏭️ Skipping...';
      currentLyrics = '';
      
      if (skipCount < maxSkips) {
        skipToNextLetter();
      } else {
        // Game over due to skip limit
        document.getElementById('game-status').textContent = '❌ Game Over! You\'ve used all 2 skip attempts!';
        setTimeout(() => {
          endGame();
        }, 2000);
      }
    });

    // Close game button
    document.getElementById('close-game-btn').addEventListener('click', () => {
      // Pause transcription updates
      transcriptionPaused = true;
      
      // Clear transcription state
      document.getElementById('live-transcript').textContent = '';
      document.getElementById('listening-indicator').textContent = '❌ Closing...';
      currentLyrics = '';
      
      endGame();
      closeGame();
    });

    function updateTimer() {
      const timerElement = document.getElementById('game-timer');
      if (timerElement) {
        timerElement.textContent = `${timeLeft}s`;
        
        if (timeLeft <= 10) {
          timerElement.style.color = '#f44336';
        } else if (timeLeft <= 15) {
          timerElement.style.color = '#ff9800';
        }
      }
    }

    function beginGame() {
      gameActive = true;
      timeLeft = 30;
      currentLetter = letters[Math.floor(Math.random() * letters.length)];
      
      // Reset game state
      score = 0;
      round = 1;
      streak = 0;
      maxStreak = 0;
      skipCount = 0;
      
      document.getElementById('game-letter').textContent = currentLetter;
      document.getElementById('start-game-btn').textContent = '🎤 Singing...';
      document.getElementById('start-game-btn').disabled = true;
      document.getElementById('submit-lyrics-btn').style.display = 'inline-block';
      document.getElementById('game-status').textContent = `Round ${round}: Sing any lyrics from a song that starts with "${currentLetter}"`;
      
      // Reset skip button
      const skipBtn = document.getElementById('skip-letter-btn');
      skipBtn.textContent = `⏭️ Skip Letter (${maxSkips} left)`;
      skipBtn.style.backgroundColor = '#ff9500';
      skipBtn.disabled = false;
      
      updateScore();
      
      // Start timer
      gameTimer = setInterval(() => {
        timeLeft--;
        updateTimer();
        
        if (timeLeft <= 0) {
          endGame();
        }
      }, 1000);

      // Setup voice recognition for game
      setupGameRecognition();
    }

    function updateScore() {
      document.getElementById('game-score').textContent = `Score: ${score}`;
      document.getElementById('game-streak').textContent = `Streak: ${streak}`;
    }

    function skipToNextLetter() {
      if (!gameActive) return;
      
      // Increment skip count
      skipCount++;
      
      // Generate new letter
      currentLetter = letters[Math.floor(Math.random() * letters.length)];
      document.getElementById('game-letter').textContent = currentLetter;
      
      // Reset timer
      timeLeft = 30;
      updateTimer();
      
      // Update status with skip count
      const remainingSkips = maxSkips - skipCount;
      document.getElementById('game-status').textContent = `Letter skipped! New letter: "${currentLetter}" (-2 points) | Skips left: ${remainingSkips}`;
      
      // Small penalty for skipping (optional)
      score = Math.max(0, score - 2); // Lose 2 points for skipping
      updateScore();
      
      // Update skip button text to show remaining skips
      const skipBtn = document.getElementById('skip-letter-btn');
      skipBtn.textContent = `⏭️ Skip Letter (${remainingSkips} left)`;
      
      // If no skips left, disable button
      if (skipCount >= maxSkips) {
        skipBtn.textContent = '⏭️ No Skips Left';
        skipBtn.style.backgroundColor = '#666';
        skipBtn.disabled = true;
      }
      
      // Show feedback for a moment
      setTimeout(() => {
        transcriptionPaused = false; // Resume transcription
        document.getElementById('game-status').textContent = `Round ${round}: Sing any lyrics from a song that starts with "${currentLetter}"`;
        
        // Restart voice recognition after skipping
        if (recognition) {
          try {
            recognition.start();
          } catch (e) {
            console.log('Recognition restart after skip failed:', e);
          }
        }
      }, 2000);
    }

    function setupGameRecognition() {
      // Stop existing recognition
      if (recognition) {
        try {
          recognition.stop();
        } catch (e) {
          console.log('Stop failed:', e);
        }
      }

      // Store original handlers
      originalOnResult = recognition.onresult;
      const originalOnEnd = recognition.onend;
      
      // Override recognition handler for game
      recognition.onresult = (event) => {
        if (gameActive) {
          handleGameInput(event);
        } else {
          // Use original handler for normal voice navigation
          if (originalOnResult) {
            originalOnResult(event);
          }
        }
      };

      // Override onend handler to auto-restart in game mode
      recognition.onend = () => {
        if (gameActive) {
          console.log('Recognition ended in game mode, restarting...');
          setTimeout(() => {
            try {
              recognition.start();
              console.log('Auto-restarted recognition for game');
            } catch (e) {
              console.log('Auto-restart failed:', e);
            }
          }, 100);
        } else {
          // Use original handler for normal voice navigation
          if (originalOnEnd) {
            originalOnEnd();
          }
        }
      };

      // Start fresh voice recognition for game
      setTimeout(() => {
        try {
          recognition.start();
          console.log('Fresh game recognition started');
        } catch (e) {
          console.log('Recognition start failed:', e);
        }
      }, 100);
    }

    // Store current lyrics for submission
    let currentLyrics = '';
    let transcriptionPaused = false;

    function handleGameInput(event) {
      // Don't update transcription if paused (button clicked)
      if (transcriptionPaused) {
        return;
      }

      let finalTranscript = '';
      let interimTranscript = '';
      
      // Build transcript from all results (only from the current round)
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }
      
      // Show live transcription
      const liveTranscriptElement = document.getElementById('live-transcript');
      const listeningIndicator = document.getElementById('listening-indicator');
      
      if (interimTranscript) {
        liveTranscriptElement.textContent = `🎤 Live: "${interimTranscript}"`;
        listeningIndicator.textContent = '🎤 Listening... (click Submit when ready)';
        currentLyrics = interimTranscript.toLowerCase().trim();
      } else if (finalTranscript) {
        liveTranscriptElement.textContent = `✅ Final: "${finalTranscript}"`;
        listeningIndicator.textContent = '✅ Ready to submit!';
        currentLyrics = finalTranscript.toLowerCase().trim();
      }
    }

    function submitCurrentLyrics() {
      if (!currentLyrics) {
        document.getElementById('game-status').textContent = 'Please sing some lyrics first!';
        return;
      }

      // Show processing message
      document.getElementById('game-status').textContent = '🎵 Analyzing song...';
      document.getElementById('listening-indicator').textContent = '🔍 Searching Spotify...';
      
      // Use Spotify API to search for songs by lyrics
      searchSpotifyByLyrics(currentLyrics).then(spotifyResult => {
        if (spotifyResult && spotifyResult.title) {
          // Check if song title starts with the current letter (case insensitive)
          const songStartsWithLetter = spotifyResult.title.toLowerCase().startsWith(currentLetter.toLowerCase());
          
          if (songStartsWithLetter) {
            // Calculate points based on difficulty and streak
            let points = 10; // Base points
            if (timeLeft > 20) points += 5; // Bonus for quick response
            if (streak > 0) points += streak * 2; // Streak bonus
            points += 5; // Bonus for Spotify recognition
            
            score += points;
            streak++;
            maxStreak = Math.max(maxStreak, streak);
            round++;
            
            updateScore();
            
            document.getElementById('game-status').textContent = `Perfect! +${points} points! 🎉 (Streak: ${streak}) (Song: "${spotifyResult.title}")`;
            document.getElementById('live-transcript').textContent = `🎯 Success! Found: "${spotifyResult.title}"`;
            document.getElementById('listening-indicator').textContent = '🎉 Correct! Moving to next round...';
            
            setTimeout(() => {
              currentLetter = letters[Math.floor(Math.random() * letters.length)];
              document.getElementById('game-letter').textContent = currentLetter;
              document.getElementById('game-status').textContent = `Round ${round}: Sing any lyrics from a song that starts with "${currentLetter}"`;
              
              // Clear all lyrics and reset state
              document.getElementById('live-transcript').textContent = '';
              document.getElementById('listening-indicator').textContent = '🎤 Listening... (click Submit when ready)';
              currentLyrics = '';
              
              timeLeft = 30; // Reset timer
              updateTimer();
              
              // Create fresh recognition instance for next round
              setTimeout(() => {
                setupGameRecognition();
                console.log('Fresh recognition setup for round', round);
              }, 200);
            }, 3000);
          } else {
            document.getElementById('game-status').textContent = `Good song (You sang: "${spotifyResult.title}"), but the song title should start with "${currentLetter}"! Try a different song!`;
            document.getElementById('live-transcript').textContent = `❌ Wrong letter: "${spotifyResult.title}" starts with "${spotifyResult.title.charAt(0).toUpperCase()}"`;
            document.getElementById('listening-indicator').textContent = '❌ Wrong letter - try again!';
            
            // Clear the transcript after a moment and keep listening
            setTimeout(() => {
              transcriptionPaused = false; // Resume transcription
              document.getElementById('live-transcript').textContent = '';
              document.getElementById('listening-indicator').textContent = '🎤 Listening... (click Submit when ready)';
              document.getElementById('game-status').textContent = `Round ${round}: Sing any lyrics from a song that starts with "${currentLetter}"`;
              
              // Ensure recognition is still running
              if (recognition && gameActive) {
                try {
                  recognition.start();
                  console.log('Recognition restarted after failed attempt');
                } catch (e) {
                  console.log('Recognition restart after fail failed:', e);
                }
              }
            }, 3000);
          }
        } else {
          // Fallback to basic pattern detection
          const isSong = detectIfSong(currentLyrics);
          if (isSong) {
            document.getElementById('game-status').textContent = `I couldn't find that song in Spotify. Try a more popular song or sing clearer!`;
            document.getElementById('live-transcript').textContent = '❓ Song not found in database';
            document.getElementById('listening-indicator').textContent = '❓ Not found - try again!';
          } else {
            document.getElementById('game-status').textContent = `That doesn't sound like a real song. Try singing actual song lyrics!`;
            document.getElementById('live-transcript').textContent = '❌ Not recognized as song lyrics';
            document.getElementById('listening-indicator').textContent = '❌ Not song lyrics - try again!';
          }
          
          // Clear the transcript after a moment and keep listening
          setTimeout(() => {
            transcriptionPaused = false; // Resume transcription
            document.getElementById('live-transcript').textContent = '';
            document.getElementById('listening-indicator').textContent = '🎤 Listening... (click Submit when ready)';
            document.getElementById('game-status').textContent = `Round ${round}: Sing any lyrics from a song that starts with "${currentLetter}"`;
            
            // Ensure recognition is still running
            if (recognition && gameActive) {
              try {
                recognition.start();
                console.log('Recognition restarted after song not found');
              } catch (e) {
                console.log('Recognition restart after not found failed:', e);
              }
            }
          }, 3000);
        }
      }).catch(() => {
        document.getElementById('game-status').textContent = `Spotify search failed. Try again!`;
        document.getElementById('live-transcript').textContent = '⚠️ Search error - keep trying!';
        document.getElementById('listening-indicator').textContent = '⚠️ Error - try again!';
        
        setTimeout(() => {
          transcriptionPaused = false; // Resume transcription
          document.getElementById('live-transcript').textContent = '';
          document.getElementById('listening-indicator').textContent = '🎤 Listening... (click Submit when ready)';
          document.getElementById('game-status').textContent = `Round ${round}: Sing any lyrics from a song that starts with "${currentLetter}"`;
          
          // Ensure recognition is still running
          if (recognition && gameActive) {
            try {
              recognition.start();
              console.log('Recognition restarted after Spotify error');
            } catch (e) {
              console.log('Recognition restart after error failed:', e);
            }
          }
        }, 3000);
      });
    }

    // Spotify API integration for song search
    async function searchSpotifyByLyrics(transcript) {
      try {
        // First, get an access token (you'll need to set up Spotify Web API)
        const accessToken = await getSpotifyAccessToken();
        
        if (!accessToken) {
          console.log('Spotify access token not available');
          return null;
        }

        // Search for songs using the lyrics as a query
        const searchQuery = `"${transcript}"`;
        const response = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=10`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          
          if (data.tracks && data.tracks.items.length > 0) {
            // Return the first (most relevant) result
            const track = data.tracks.items[0];
            return {
              title: track.name,
              artist: track.artists[0].name,
              album: track.album.name,
              popularity: track.popularity,
              preview_url: track.preview_url
            };
          }
        }
      } catch (error) {
        console.log('Spotify search failed:', error);
      }
      
      return null;
    }

    // Get Spotify access token (you need to set this up)
    async function getSpotifyAccessToken() {
      // Option 1: Use Client Credentials Flow (recommended for this use case)
      try {
        const response = await fetch('https://accounts.spotify.com/api/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': 'Basic ' + btoa('1c7d916ebdc84af59523680d7db2fc9f:49733f25214c4102887fadab36a347bd')
          },
          body: 'grant_type=client_credentials'
        });

        if (response.ok) {
          const data = await response.json();
          return data.access_token;
        }
      } catch (error) {
        console.log('Failed to get Spotify token:', error);
      }

      // Option 2: Use a hardcoded token for testing (not recommended for production)
      // return 'YOUR_SPOTIFY_ACCESS_TOKEN_HERE';
      
      return null;
    }

    // Simple fallback song detection for when Spotify is unavailable
    function detectIfSong(text) {
      // Basic check: if it has multiple words and sounds like lyrics
      const words = text.toLowerCase().split(' ');
      if (words.length < 2) return false;
      
      // Check for common song indicators
      const songIndicators = ['love', 'heart', 'dream', 'night', 'day', 'sky', 'baby', 'honey', 'darling'];
      const hasSongWords = words.some(word => songIndicators.some(indicator => word.includes(indicator)));
      
      return hasSongWords || words.length >= 3;
    }


    function endGame() {
      gameActive = false;
      if (gameTimer) {
        clearInterval(gameTimer);
      }
      
      const statusElement = document.getElementById('game-status');
      const buttonElement = document.getElementById('start-game-btn');
      
      if (statusElement) {
        statusElement.textContent = `Game Over! Final Score: ${score} | Max Streak: ${maxStreak}`;
      }
      if (buttonElement) {
        buttonElement.textContent = '🎤 Play Again';
        buttonElement.disabled = false;
      }
      
      // Restore original recognition handler
      if (originalOnResult && recognition) {
        recognition.onresult = originalOnResult;
      }
      
      if (recognition) {
        recognition.stop();
      }
    }

    function closeGame() {
      const gameOverlay = document.getElementById('song-game');
      if (gameOverlay) {
        document.body.removeChild(gameOverlay);
      }
      
      // Clean up
      if (gameTimer) {
        clearInterval(gameTimer);
      }
      if (recognition) {
        recognition.stop();
      }
      
      // Restore original recognition handler
      if (originalOnResult && recognition) {
        recognition.onresult = originalOnResult;
      }
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "TOGGLE_OVERLAY") {
      btn.style.display = btn.style.display === "none" ? "block" : "none";
      gameBtn.style.display = gameBtn.style.display === "none" ? "block" : "none";
    }
  });
}
