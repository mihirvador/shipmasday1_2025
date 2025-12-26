export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
        };
      };
      gifts: {
        Row: {
          id: string;
          creator_id: string;
          name: string;
          objects: GiftObject[];
          wrapped: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          creator_id: string;
          name: string;
          objects: GiftObject[];
          wrapped?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          creator_id?: string;
          name?: string;
          objects?: GiftObject[];
          wrapped?: boolean;
          created_at?: string;
        };
      };
      gift_openings: {
        Row: {
          id: string;
          gift_id: string;
          opener_id: string;
          opened_at: string;
        };
        Insert: {
          id?: string;
          gift_id: string;
          opener_id: string;
          opened_at?: string;
        };
        Update: {
          id?: string;
          gift_id?: string;
          opener_id?: string;
          opened_at?: string;
        };
      };
    };
  };
}

export interface GiftObject {
  url: string;
  format?: string;  // Model format: glb, ply, obj
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Gift {
  id: string;
  creator_id: string;
  name: string;
  objects: GiftObject[];
  wrapped: boolean;
  created_at: string;
}

