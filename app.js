(() => {

    const localVideo = document.getElementById("local");
    const remoteVideo = document.getElementById("remote");

    const roomId = "test-room";
    const socket = io();

    let peer;
    let localStream;

    function createPeer() {

        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        pc.ontrack = (event) => {
            console.log("TRACK RECEIVED");
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.play().catch(()=>{});
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("candidate", {
                    candidate: event.candidate,
                    roomId
                });
            }
        };

        pc.onconnectionstatechange = () => {
            console.log("CONNECTION:", pc.connectionState);
        };

        pc.oniceconnectionstatechange = () => {
            console.log("ICE:", pc.iceConnectionState);
        };

        return pc;
    }

    async function start() {

        peer = createPeer();

        // 1. камера
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        // 2. ВАЖНО: addTrack ДО любых signaling действий
        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });

        // 3. join только после готовности stream
        socket.emit("join", roomId);

        setupSocket();
    }

    function setupSocket() {

        socket.on("user-joined", async () => {
            console.log("USER JOINED → creating offer");

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);

            socket.emit("offer", {
                offer,
                roomId
            });
        });

        socket.on("offer", async (offer) => {
            console.log("GOT OFFER");

            await peer.setRemoteDescription(
                new RTCSessionDescription(offer)
            );

            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            socket.emit("answer", {
                answer,
                roomId
            });
        });

        socket.on("answer", async (answer) => {
            console.log("GOT ANSWER");

            await peer.setRemoteDescription(
                new RTCSessionDescription(answer)
            );
        });

        socket.on("candidate", async (candidate) => {
            try {
                await peer.addIceCandidate(
                    new RTCIceCandidate(candidate)
                );
            } catch (e) {
                console.error(e);
            }
        });
    }

    start();

})();