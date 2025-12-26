'use client';

import dynamic from 'next/dynamic';

const GiftUnwrap = dynamic(() => import('@/components/GiftUnwrap'), { ssr: false });

export default function UnwrapPage() {
  return <GiftUnwrap />;
}

