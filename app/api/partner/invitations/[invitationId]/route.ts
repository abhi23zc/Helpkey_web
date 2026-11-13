import { withApiHandler, actorFromRequest } from "@/lib/api/handler";
import { z } from "zod";
import { acceptInvitation, previewInvitation } from "@/lib/partner/pms/team";
export const POST = withApiHandler(
  async (request, context: { params: Promise<{ invitationId: string }> }) => {
    const { token, preview } = z
      .object({
        token: z.string().max(100),
        preview: z.boolean().default(false),
      })
      .strict()
      .parse(await request.json());
    return Response.json(
      await (preview ? previewInvitation : acceptInvitation)(
        actorFromRequest().uid,
        (await context.params).invitationId,
        token,
      ),
    );
  },
  {
    route: "/api/partner/invitations/[invitationId]",
    auth: "strict",
    requireAuth: true,
    cache: "private",
  },
);
