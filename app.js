(() => {

    const localVideo = document.getElementById("local");
    const remoteVideo = document.getElementById("remote");

    const socket = io();

    const peer = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            {
                urls: "turn:openrelay.metered.ca:80",
                username: "openrelayproject",
                credential: "openrelayproject"
            }
]
    });

    let localStream;

    async function start() {

        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        localVideo.srcObject = localStream;

        localStream.getTracks().forEach(track => {
            peer.addTrack(track, localStream);
        });

    }

    start();

    peer.ontrack = event => {

        console.log("REMOTE TRACK");

        remoteVideo.srcObject = event.streams[0];

    };

    peer.onicecandidate = event => {

        if (event.candidate) {

            console.log("SENDING CANDIDATE");

            socket.emit("candidate", event.candidate);

        }

    };

    socket.on("candidate", async candidate => {

        console.log("RECEIVED CANDIDATE");

        try {
            await peer.addIceCandidate(candidate);
        } catch (e) {
            console.error(e);
        }

    });

    socket.on("offer", async offer => {

        console.log("RECEIVED OFFER");

        await peer.setRemoteDescription(offer);

        const answer = await peer.createAnswer();

        await peer.setLocalDescription(answer);

        socket.emit("answer", answer);

    });

    socket.on("answer", async answer => {

        console.log("RECEIVED ANSWER");

        await peer.setRemoteDescription(answer);

    });

    window.call = async () => {

        console.log("CREATING OFFER");

        const offer = await peer.createOffer();

        await peer.setLocalDescription(offer);

        socket.emit("offer", offer);

    };

})();