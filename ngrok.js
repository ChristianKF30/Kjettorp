import * as ngrok from "@ngrok/ngrok";

(async function () {
	const session = await new ngrok.SessionBuilder()
		.authtokenFromEnv()
		.serverAddr("connect.http --url=yearling-diabetic-apostle.ngrok-free.dev --region=eu")
		.connect();

	const listener = await session
		.httpEndpoint()
		.listenAndForward("http://localhost:3000");
	console.log(`Ingress established at: ${listener.url()}`);
})();
