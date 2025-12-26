# 🎁 Gift Maker - Create & Share 3D Gifts

A Next.js application that lets users create 3D gifts with AI-powered text-to-3D generation, arrange them in a Three.js viewer, wrap them as mystery gifts, and share them for others to discover.

## Features

- **Email Authentication** - Simple email-based user identification via Supabase
- **3D Viewer** - Interactive Three.js scene with OrbitControls for camera manipulation
- **AI Text-to-3D** - Generate 3D models from text prompts (requires backend API)
- **Object Manipulation** - Move, rotate, and scale objects in the 3D scene
- **Gift Wrapping** - Combine multiple 3D objects into a wrapped gift
- **Gift Discovery** - Browse and unwrap mystery gifts from other users

## Getting Started

### Prerequisites

- Node.js 18+ 
- A Supabase project (optional for demo mode)
- A Text-to-3D API endpoint (optional for demo mode)

### Installation

```bash
cd frontend
npm install
```

### Environment Variables

Create a `.env.local` file in the frontend directory:

```env
# Supabase Configuration (optional - runs in demo mode if not set)
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key

# Text-to-3D API Endpoint (optional - uses demo models if not set)
NEXT_PUBLIC_TEXT_TO_3D_API=http://localhost:8000/generate

# Supabase Storage Bucket Name
NEXT_PUBLIC_STORAGE_BUCKET=gifts
```

### Database Setup

If using Supabase, run the SQL schema in your Supabase SQL editor:

```sql
-- See supabase-schema.sql for the complete schema
```

The schema creates:
- `users` table - stores user emails
- `gifts` table - stores wrapped gifts with their 3D objects
- `gift_openings` table - tracks who opened which gifts and when

### Storage Setup

Create a storage bucket named `gifts` in your Supabase dashboard with public read access.

### Running the App

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Pages

### Home (`/`)
Email entry page where users sign in or create an account.

### Studio (`/studio`)
The main gift creation workspace:
- 3D viewer on the left with orbit controls
- Sidebar on the right for generating objects and managing the scene
- Transform controls for selected objects
- "Wrap as Gift" button to finalize the creation

### Unwrap (`/unwrap`)
Gift discovery page where users can:
- See a wrapped mystery gift from another user
- Click to unwrap and reveal the 3D contents
- Find more gifts to unwrap

## Project Structure

```
frontend/
├── app/
│   ├── api/
│   │   └── generate/        # Text-to-3D API route
│   ├── studio/              # Gift creation studio
│   ├── unwrap/              # Gift unwrapping page
│   ├── layout.tsx
│   ├── page.tsx             # Email entry
│   └── globals.css
├── components/
│   ├── EmailEntry.tsx       # Login/signup form
│   ├── GiftUnwrap.tsx       # Unwrap experience
│   ├── Scene3D.tsx          # Three.js viewer
│   ├── Sidebar.tsx          # Generation & object controls
│   └── WrapGiftModal.tsx    # Gift naming modal
├── lib/
│   ├── store.ts             # Zustand state management
│   └── supabase.ts          # Supabase client & helpers
├── types/
│   └── database.ts          # TypeScript types
├── public/
│   └── demo-models/         # Sample OBJ files
└── supabase-schema.sql      # Database schema
```

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **3D**: Three.js with React Three Fiber & Drei
- **State**: Zustand
- **Database**: Supabase (PostgreSQL)
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS 4

## Text-to-3D API Integration

The app expects a POST endpoint that accepts:

```json
{
  "prompt": "A cute teddy bear with a bow tie"
}
```

And returns either:
- JSON with `modelUrl` pointing to a .obj or .ply file
- The model file directly as a binary response

## Demo Mode

If Supabase credentials are not configured, the app runs in demo mode:
- User authentication is simulated
- Gifts are stored in memory (lost on refresh)
- Sample demo gifts are available to unwrap

## License

MIT
