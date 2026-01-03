import { NextResponse } from 'next/server';
import { IoTDataPlaneClient, PublishCommand } from '@aws-sdk/client-iot-data-plane';

const iotClient = new IoTDataPlaneClient({
    region: process.env.AWS_IOT_REGION!,
    endpoint: `https://${process.env.AWS_IOT_ENDPOINT}`,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
});

const TOPIC = process.env.AWS_IOT_TOPIC || 'robot/control';

// Map lowercase commands to uppercase plain text
const commandMap: Record<string, string> = {
    forward: 'FORWARD',
    backward: 'BACKWARD',
    left: 'LEFT',
    right: 'RIGHT',
    stop: 'STOP',
};

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { command } = body;

        if (!['forward', 'backward', 'left', 'right', 'stop'].includes(command)) {
            return NextResponse.json({ error: 'Invalid command' }, { status: 400 });
        }

        const payload = commandMap[command];

        // Publish to AWS IoT Core
        const publishCommand = new PublishCommand({
            topic: TOPIC,
            payload: Buffer.from(payload, 'utf-8'),
            qos: 1,
        });

        await iotClient.send(publishCommand);

        console.log(`[AWS IoT] Published to ${TOPIC}: ${payload}`);

        return NextResponse.json({
            success: true,
            message: `Executed command: ${command}`,
            topic: TOPIC,
            payload: payload,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error publishing to IoT:', error);
        return NextResponse.json({ error: 'Failed to process command' }, { status: 500 });
    }
}
