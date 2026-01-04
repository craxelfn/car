import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({
    region: process.env.NEXT_PUBLIC_AWS_REGION,
    credentials: {
        accessKeyId: process.env.NEXT_PUBLIC_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY!,
    },
});

const docClient = DynamoDBDocumentClient.from(client);

export async function GET() {
    try {
        const tableName = process.env.DYNAMODB_TABLE_NAME;

        if (!tableName) {
            return NextResponse.json({ error: 'DynamoDB table name not configured' }, { status: 500 });
        }

        // Calculate timestamp for 1 minute ago to get recent stats
        const oneMinuteAgo = Date.now() - 60000;

        const command = new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk AND SK > :sk',
            ExpressionAttributeValues: {
                ':pk': 'System_Stats',
                ':sk': oneMinuteAgo.toString()
            },
            ScanIndexForward: false, // Sort descending (newest first)
            Limit: 1
        });

        const response = await docClient.send(command);
        const item = response.Items?.[0];

        if (item) {
            return NextResponse.json({
                cpu: parseFloat(item.CPU),
                ram: parseFloat(item.RAM),
                timestamp: parseInt(item.SK)
            });
        }

        return NextResponse.json({ error: 'No stats found' }, { status: 404 });

    } catch (error) {
        console.error('Error fetching system stats:', error);
        return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
    }
}
