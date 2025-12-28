import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: projectId } = await params;

    // Fetch project from database
    const db = getDb();
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));

    if (!project) {
      return new ImageResponse(
        (
          <div
            style={{
              display: 'flex',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#18181b',
              color: '#ffffff',
              fontSize: 40,
            }}
          >
            Project not found
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      );
    }

    // Simple thumbnail - just project name on colored background
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#6366f1',
            color: '#ffffff',
            fontSize: 72,
            fontWeight: 'bold',
            padding: 60,
            textAlign: 'center',
          }}
        >
          {project.name}
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  } catch (error) {
    console.error('Error generating OG image:', error);

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#ef4444',
            color: '#ffffff',
            fontSize: 40,
          }}
        >
          Error generating thumbnail
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  }
}
