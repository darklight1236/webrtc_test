(() => {

    const localVideo = document.getElementById("local");
    const container = document.querySelector(".container");

    const socket = io({
        transports: ['websocket']
    });
    const roomId = "test-room";

    // ВЫТАСКИВАЕМ ИМЯ ИЗ URL И СОЗДАЕМ ХРАНИЛИЩЕ ДЛЯ ЧУЖИХ ИМЕН
    const urlParams = new URLSearchParams(window.location.search);
    const myName = urlParams.get('name') || "Guest";
    const peerNames = {};

    let localStream = null;

    // ───────────────────────────────
    // АНАЛИЗАТОР ГРОМКОСТИ (ЗЕЛЕНАЯ РАМКА)
    // ───────────────────────────────
    let audioContext;

    function monitorSpeaking(stream, wrapperElement) {
        try {
            if (!audioContext) {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            const analyzer = audioContext.createAnalyser();
            analyzer.fftSize = 256;

            // Берем только аудио треки, чтобы избежать ошибок
            const audioStream = new MediaStream(stream.getAudioTracks());
            if (audioStream.getAudioTracks().length === 0) return;

            const microphone = audioContext.createMediaStreamSource(audioStream);
            microphone.connect(analyzer);
            const dataArray = new Uint8Array(analyzer.frequencyBinCount);

            function checkVolume() {
                analyzer.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;

                // Если звук громче порога (10) - включаем зеленую рамку
                if (average > 10) {
                    wrapperElement.classList.add("speaking");
                } else {
                    wrapperElement.classList.remove("speaking");
                }
                requestAnimationFrame(checkVolume);
            }
            checkVolume();
        } catch (e) {
            console.error("Audio Context error:", e);
        }
    }

    let streamReady = false;

    const peers = {};
    const pendingCandidates = {};

    // ───────────────────────────────
    // START
    // ───────────────────────────────

    async function start() {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        streamReady = true;
        localVideo.srcObject = localStream;

        // ПИШЕМ СВОЕ ИМЯ НАД СВОИМ ВИДЕО
        document.querySelector("#local-client label").innerText = myName;

        monitorSpeaking(localStream, document.getElementById("local-client"));

        // ОТПРАВЛЯЕМ СЕРВЕРУ СВОЕ ИМЯ
        socket.emit("join-room", { roomId: roomId, name: myName });
    }

    // ───────────────────────────────
    // CREATE PEER
    // ───────────────────────────────

    // ───────────────────────────────
    // CREATE PEER (УЛУЧШЕННЫЙ)
    // ───────────────────────────────

    function createPeer(id) {

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                {
                    urls: "turn:159.194.214.116:3478",
                    username: "crewlink",
                    credential: "Antonden1" // Тот пароль, что ты указал в конфиге
                }
            ]
        });

        peers[id] = pc;

        // Добавляем наши локальные треки (камеру и микрофон) в соединение
        localStream.getTracks().forEach(track => {
            pc.addTrack(track, localStream);
        });

        // 1. СОЗДАЕМ ПРАВИЛЬНУЮ ОБЕРТКУ ДЛЯ ВЕРСТКИ
        const clientDiv = document.createElement("div");
        clientDiv.className = "client"; // Тот самый класс из твоего CSS
        clientDiv.id = "wrapper-" + id;

        const label = document.createElement("label");
        // БЕРЕМ ИМЯ ИЗ ХРАНИЛИЩА ИЛИ ПИШЕМ "Собеседник" ЕСЛИ ЕГО ТАМ НЕТ
        label.innerText = peerNames[id] || "Собеседник";
        clientDiv.appendChild(label);

        const video = document.createElement("video");
        video.autoplay = true;
        video.playsInline = true;
        // video.muted = true; // РАСКОММЕНТИРУЙ для теста, если браузер всё равно блокирует звук
        video.id = id;

        clientDiv.appendChild(video);
        container.appendChild(clientDiv);

        // 2. ОБРАБОТКА ПОЛУЧЕННОГО ПОТОКА
        pc.ontrack = (event) => {
            video.srcObject = event.streams[0];

            // Заставляем браузер воспроизвести видео, как только оно загрузится
            video.onloadedmetadata = () => {
                video.play().catch(err => {
                    console.error("Браузер заблокировал автоплей:", err);
                    // Здесь в идеале нужно показывать кнопку "Нажмите, чтобы включить звук"
                });
            };

            monitorSpeaking(event.streams[0], clientDiv);
        };

        // 3. ОТПРАВКА ICE-КАНДИДАТОВ
        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("candidate", {
                    to: id,
                    candidate: event.candidate
                });
            }
        };

        // 4. ЛОГИРОВАНИЕ СТАТУСА СЕТИ (ОЧЕНЬ ВАЖНО)
        pc.oniceconnectionstatechange = () => {
            console.log(`Статус соединения с ${id}:`, pc.iceConnectionState);
        };

        return pc;
    }

    // ───────────────────────────────
    // USERS LIST
    // ───────────────────────────────

    socket.on("users", (users) => {
        if (!streamReady) return;

        users.forEach(user => {
            if (user.id === socket.id) return;
            if (peers[user.id]) return;

            // Сохраняем имя того, кто уже был в комнате
            peerNames[user.id] = user.name;

            const pc = createPeer(user.id);

            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    socket.emit("offer", {
                        to: user.id, // Отправляем оффер на конкретный ID
                        offer: pc.localDescription
                    });
                });
        });
    });

    // ───────────────────────────────
    // НОВЫЙ ПОЛЬЗОВАТЕЛЬ ЗАШЕЛ
    // ───────────────────────────────
    socket.on("user-joined", ({ id, name }) => {
        // Запоминаем имя новенького ДО того, как от него прилетит WebRTC оффер
        peerNames[id] = name;
    });

    // ───────────────────────────────
    // OFFER
    // ───────────────────────────────

    socket.on("offer", async ({ from, offer }) => {

        if (!peers[from]) {
            createPeer(from);
        }

        const pc = peers[from];

        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // flush ICE
        if (pendingCandidates[from]) {
            for (const c of pendingCandidates[from]) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            pendingCandidates[from] = [];
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
            to: from,
            answer
        });
    });

    // ───────────────────────────────
    // ANSWER
    // ───────────────────────────────

    socket.on("answer", async ({ from, answer }) => {

        const pc = peers[from];

        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        if (pendingCandidates[from]) {
            for (const c of pendingCandidates[from]) {
                await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            pendingCandidates[from] = [];
        }
    });

    // ───────────────────────────────
    // CANDIDATES
    // ───────────────────────────────

    socket.on("candidate", async ({ from, candidate }) => {

        const pc = peers[from];

        if (!pc) return;

        if (!pc.remoteDescription) {

            if (!pendingCandidates[from]) {
                pendingCandidates[from] = [];
            }

            pendingCandidates[from].push(candidate);
            return;
        }

        await pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    // ───────────────────────────────
    // USER DISCONNECTED
    // ───────────────────────────────
    socket.on("user-disconnected", (id) => {
        if (peers[id]) {
            peers[id].close(); // Закрываем P2P соединение
            delete peers[id];  // Удаляем из памяти
        }

        // Находим блок с видео и удаляем его из верстки
        const videoWrapper = document.getElementById("wrapper-" + id);
        if (videoWrapper) {
            videoWrapper.remove();
        }
    });

    // ───────────────────────────────
    // УПРАВЛЕНИЕ КНОПКАМИ
    // ───────────────────────────────
    let isCamOn = true;
    let isMicOn = true;
    let isDeafened = false;
    let isScreenSharing = false;
    let originalVideoTrack = null;

    // 1. КАМЕРА
    document.getElementById("camBtn").addEventListener("click", (e) => {
        isCamOn = !isCamOn;
        localStream.getVideoTracks()[0].enabled = isCamOn;
        e.target.classList.toggle("off", !isCamOn);
    });

    // 2. МИКРОФОН
    document.getElementById("micBtn").addEventListener("click", (e) => {
        if (isDeafened) return; // Если мы в режиме "глухонемого", микрофон не трогаем
        isMicOn = !isMicOn;
        localStream.getAudioTracks()[0].enabled = isMicOn;
        e.target.classList.toggle("off", !isMicOn);
    });

    // 3. DEAFEN (Глухонемой)
    document.getElementById("deafenBtn").addEventListener("click", (e) => {
        isDeafened = !isDeafened;
        e.target.classList.toggle("off", isDeafened);
        e.target.classList.toggle("active", !isDeafened);

        // Выключаем/включаем свой микрофон
        localStream.getAudioTracks()[0].enabled = !isDeafened && isMicOn;

        // Выключаем/включаем звук у всех чужих видео
        const allVideos = document.querySelectorAll("video:not(#local)");
        allVideos.forEach(v => {
            v.muted = isDeafened;
        });
    });

    // 4. ДЕМОНСТРАЦИЯ ЭКРАНА
    document.getElementById("screenBtn").addEventListener("click", async (e) => {
        if (!isScreenSharing) {
            try {
                // Запрашиваем экран у пользователя
                const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
                const screenTrack = screenStream.getVideoTracks()[0];

                // Заменяем трек видео у всех, с кем мы соединены (без переподключения)
                for (let id in peers) {
                    const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
                    if (sender) sender.replaceTrack(screenTrack);
                }

                // Показываем экран у себя (оставляя свой старый микрофон)
                originalVideoTrack = localStream.getVideoTracks()[0];
                localVideo.srcObject = new MediaStream([screenTrack, localStream.getAudioTracks()[0]]);

                isScreenSharing = true;
                e.target.classList.add("presenting"); // У тебя в CSS есть этот класс (синий цвет)

                // Если пользователь нажал "Закрыть доступ" на системной плашке браузера
                screenTrack.onended = stopScreenShare;
            } catch (err) {
                console.error("Ошибка захвата экрана:", err);
            }
        } else {
            stopScreenShare();
        }
    });

    function stopScreenShare() {
        if (!isScreenSharing) return;
        for (let id in peers) {
            const sender = peers[id].getSenders().find(s => s.track.kind === 'video');
            if (sender) sender.replaceTrack(originalVideoTrack);
        }
        localVideo.srcObject = localStream; // Возвращаем камеру себе
        isScreenSharing = false;
        document.getElementById("screenBtn").classList.remove("presenting");
    }

    // 5. КНОПКА ОТКЛЮЧЕНИЯ
    document.getElementById("leaveBtn").addEventListener("click", () => {
        socket.disconnect(); // Разрываем сокет
        for (let id in peers) {
            peers[id].close(); // Закрываем WebRTC соединения
        }
        window.location.href = "/index.html"; // Уходим в лобби
    });


    start();

})();