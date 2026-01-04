import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
    region: process.env.AWS_REGION || process.env.NEXT_PUBLIC_AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
    },
});

const docClient = DynamoDBDocumentClient.from(client);

export async function GET() {
    try {
        const tableName = process.env.DYNAMODB_TABLE_NAME;

        if (!tableName) {
            return NextResponse.json({ error: 'DynamoDB table name not configured' }, { status: 500 });
        }

        // Query for the absolute latest System_Stats item (no time filter)
        const command = new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: {
                ':pk': 'System_Stats'
            },
            ScanIndexForward: false, // Sort descending (newest first)
            Limit: 1
        });

        const response = await docClient.send(command);
        const item = response.Items?.[0];

        if (item) {
            console.log('[System Stats] Fetched:', item);
            return NextResponse.json({
                cpu: parseFloat(item.CPU || '0'),
                ram: parseFloat(item.RAM || '0'),
                battery: parseFloat(item.Battery || '0'),
                timestamp: item.SK
            });
        }

        return NextResponse.json({ cpu: 0, ram: 0, battery: 0, timestamp: null });

    } catch (error) {
        console.error('Error fetching system stats:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
