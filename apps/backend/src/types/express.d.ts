declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        roles?: string[];
        districtId?: string | null;
        trainingCenterId?: string | null;
      };
      userPermissions?: Set<string>;
      partnerKey?: {
        id: string;
        name: string;
        prefix: string;
        scopes: string[];
      };
    }
  }
}

export {};
