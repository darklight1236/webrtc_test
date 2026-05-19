(() => {

    const localVideo = document.getElementById("local");
    const remoteVideo = document.getElementById("remote");
    const roomId = "test-room";

    const socket = io();

    let peer;
    let localStream;

    function createPeer() {

        const p = new RTCPeerConnection({
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" }
            ]
        });

        p.ontrack = (event) => {
            remoteVideo.srcObject = event.streams[0];
        };

        p.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("candidate", {
                    candidate: event.candidate,
                    roomId
                });
            }
        };

        return p;
    }

    async function start() {

        peer = createPeer();

        socket.emit("join", roomId);

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });

        setupSocketHandlers();
    }

    function setupSocketHandlers() {

        socket.on("user-joined", async () => {

            console.log("USER JOINED → CREATE OFFER");

            const offer = await peer.createOffer();
            await peer.setLocalDescription(offer);

            socket.emit("offer", {
                offer,
                roomId
            });
        });

        socket.on("offer", async (offer) => {

            console.log("GOT OFFER");

            await peer.setRemoteDescription(offer);

            const answer = await peer.createAnswer();
            await peer.setLocalDescription(answer);

            socket.emit("answer", {
                answer,
                roomId
            });
        });

        socket.on("answer", async (answer) => {

            console.log("GOT ANSWER");

            await peer.setRemoteDescription(answer);
        });

        socket.on("candidate", async ({ candidate }) => {

            console.log("GOT CANDIDATE");

            try {
                await peer.addIceCandidate(candidate);
            } catch (e) {
                console.error(e);
            }
        });
    }

    start();

})();