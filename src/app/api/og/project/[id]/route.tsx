import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
import { getDb } from '@/db';
import { projects } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const runtime = 'edge';

// Fetch Inter font from Google Fonts
async function getInterFont() {
  const response = await fetch(
    new URL('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap')
  );
  const css = await response.text();
  const fontUrl = css.match(/url\(([^)]+)\)/)?.[1];

  if (!fontUrl) {
    throw new Error('Failed to extract font URL');
  }

  const fontResponse = await fetch(fontUrl);
  return fontResponse.arrayBuffer();
}

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
            }}
          >
            <div style={{ fontSize: 32 }}>Project not found</div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      );
    }

    // Fetch Inter font
    const interFont = await getInterFont();

    // Extract platform icon/label
    const platformLabel = project.platform === 'mobile' ? '📱 Mobile' : '💻 Web';

    // Format date
    const createdDate = new Date(project.createdAt).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: '#09090b',
            backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(99, 102, 241, 0.1) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(168, 85, 247, 0.1) 0%, transparent 50%)',
            padding: 60,
            fontFamily: 'Inter',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 40,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  fontSize: 28,
                  color: '#a1a1aa',
                  fontWeight: 600,
                }}
              >
                WebContainer IDE
              </div>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'rgba(63, 63, 70, 0.5)',
                padding: '8px 16px',
                borderRadius: 8,
                fontSize: 20,
                color: '#e4e4e7',
              }}
            >
              {platformLabel}
            </div>
          </div>

          {/* Main content */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'center',
              gap: 20,
            }}
          >
            <div
              style={{
                fontSize: 64,
                fontWeight: 700,
                color: '#ffffff',
                lineHeight: 1.2,
                maxWidth: '90%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {project.name}
            </div>

            {project.description && (
              <div
                style={{
                  fontSize: 28,
                  color: '#a1a1aa',
                  lineHeight: 1.4,
                  maxWidth: '80%',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {project.description}
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '1px solid rgba(63, 63, 70, 0.5)',
              paddingTop: 24,
              marginTop: 'auto',
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 24,
                fontSize: 18,
                color: '#71717a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                📅 {createdDate}
              </div>
            </div>
            <div
              style={{
                fontSize: 18,
                color: '#52525b',
              }}
            >
              {projectId.slice(0, 8)}
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        fonts: [
          {
            name: 'Inter',
            data: interFont,
            style: 'normal',
            weight: 400,
          },
          {
            name: 'Inter',
            data: interFont,
            style: 'normal',
            weight: 600,
          },
          {
            name: 'Inter',
            data: interFont,
            style: 'normal',
            weight: 700,
          },
        ],
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
            backgroundColor: '#18181b',
            color: '#ffffff',
          }}
        >
          <div style={{ fontSize: 32 }}>Error generating thumbnail</div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    );
  }
}
