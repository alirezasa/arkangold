export interface JwtPayload {
    sub: string;
    phone: string;
    sessionId: string;
    role?: string;
    [key: string]: any;
}
