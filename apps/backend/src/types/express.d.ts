declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        roles?: string[];
      };
      userPermissions?: Set<string>;
    }
  }
}

export { };
