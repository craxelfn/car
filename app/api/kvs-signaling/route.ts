"use server";

import { NextResponse } from "next/server";
import {
    KinesisVideoClient,
    GetSignalingChannelEndpointCommand,
    DescribeSignalingChannelCommand,
} from "@aws-sdk/client-kinesis-video";
import {
    KinesisVideoSignalingClient,
    GetIceServerConfigCommand,
} from "@aws-sdk/client-kinesis-video-signaling";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";

export async function GET() {
    try {
        const region = process.env.AWS_REGION || "eu-west-3";
        const channelName = process.env.KVS_CHANNEL_NAME;
        const roleArn = process.env.PUBLIC_VIEWER_ROLE_ARN;
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

        if (!channelName || !roleArn || !accessKeyId || !secretAccessKey) {
            return NextResponse.json(
                { error: "Missing required environment variables" },
                { status: 500 }
            );
        }

        // 1. Create STS Client with long-term credentials
        const stsClient = new STSClient({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });

        // 2. Assume the Public Viewer Role
        const assumeRoleCommand = new AssumeRoleCommand({
            RoleArn: roleArn,
            RoleSessionName: `ViewerSession-${Date.now()}`,
            DurationSeconds: 3600, // 1 hour
        });

        const assumedRole = await stsClient.send(assumeRoleCommand);

        if (!assumedRole.Credentials) {
            throw new Error("Failed to assume role: No credentials returned");
        }

        const tempCredentials = {
            accessKeyId: assumedRole.Credentials.AccessKeyId!,
            secretAccessKey: assumedRole.Credentials.SecretAccessKey!,
            sessionToken: assumedRole.Credentials.SessionToken!,
        };

        // 3. Create KVS Client with SERVER credentials to get endpoints
        // Use the same server credentials as STS
        const serverCredentials = {
            accessKeyId,
            secretAccessKey,
        };

        const kinesisVideoClient = new KinesisVideoClient({
            region,
            credentials: serverCredentials,
        });

        // 4. Get Channel ARN
        const describeCommand = new DescribeSignalingChannelCommand({
            ChannelName: channelName,
        });
        const channelInfo = await kinesisVideoClient.send(describeCommand);
        const channelARN = channelInfo.ChannelInfo?.ChannelARN;

        if (!channelARN) {
            return NextResponse.json(
                { error: "Could not find signaling channel" },
                { status: 404 }
            );
        }

        // 5. Get Signaling Channel Endpoints
        const getEndpointCommand = new GetSignalingChannelEndpointCommand({
            ChannelARN: channelARN,
            SingleMasterChannelEndpointConfiguration: {
                Protocols: ["WSS", "HTTPS"],
                Role: "VIEWER",
            },
        });
        const endpointResponse = await kinesisVideoClient.send(getEndpointCommand);

        const endpoints: Record<string, string> = {};
        endpointResponse.ResourceEndpointList?.forEach((endpoint) => {
            if (endpoint.Protocol && endpoint.ResourceEndpoint) {
                endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
            }
        });

        // 6. Get ICE Server Config
        const kvsSignalingClient = new KinesisVideoSignalingClient({
            region,
            credentials: serverCredentials,
            endpoint: endpoints.HTTPS,
        });

        const iceServerCommand = new GetIceServerConfigCommand({
            ChannelARN: channelARN,
        });
        const iceServerResponse = await kvsSignalingClient.send(iceServerCommand);

        // 7. Return everything to the client
        return NextResponse.json({
            channelARN,
            channelName,
            region,
            endpoints,
            iceServers: iceServerResponse.IceServerList || [],
            credentials: tempCredentials,
        });

    } catch (error) {
        console.error("KVS Signaling Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
