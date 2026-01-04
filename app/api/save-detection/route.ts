"use server";

import { NextResponse } from "next/server";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

export async function POST(request: Request) {
    try {
        const region = process.env.AWS_REGION || "eu-west-3";
        const tableName = process.env.DYNAMODB_TABLE_NAME;
        const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

        if (!tableName || !accessKeyId || !secretAccessKey) {
            return NextResponse.json(
                { error: "Missing required environment variables (DYNAMODB_TABLE_NAME, AWS credentials)" },
                { status: 500 }
            );
        }

        // Parse request body
        const body = await request.json();
        const { objects } = body;

        if (!objects || !Array.isArray(objects) || objects.length === 0) {
            return NextResponse.json(
                { error: "No objects provided" },
                { status: 400 }
            );
        }

        // Create DynamoDB client
        const ddbClient = new DynamoDBClient({
            region,
            credentials: {
                accessKeyId,
                secretAccessKey,
            },
        });

        const docClient = DynamoDBDocumentClient.from(ddbClient);

        // Create detection record matching your table schema
        const timestamp = new Date().toISOString();

        // Get unique detected object names as a Set
        const detectedItems = [...new Set(objects.map((obj: { class: string }) => obj.class))];

        // Store in DynamoDB with your schema: PK, SK, DetectedItems
        const putCommand = new PutCommand({
            TableName: tableName,
            Item: {
                PK: "Camera_01",
                SK: timestamp,
                DetectedItems: new Set(detectedItems),
            },
        });

        await docClient.send(putCommand);

        console.log(`[DynamoDB] Stored detection at ${timestamp}: ${detectedItems.join(", ")}`);

        return NextResponse.json({
            success: true,
            timestamp,
            detectedItems,
        });

    } catch (error) {
        console.error("DynamoDB Error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
