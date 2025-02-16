import { type TokenData } from "@edgedb/auth-core";
import type { Client } from "edgedb";
import { cookies } from "next/headers";
import { cache } from "react";

import {
  NextAuth,
  NextAuthSession,
  type NextAuthOptions,
  BuiltinProviderNames,
  type CreateAuthRouteHandlers,
  _extractParams,
} from "../shared";

export {
  NextAuthSession,
  type NextAuthOptions,
  type BuiltinProviderNames,
  type TokenData,
  type CreateAuthRouteHandlers,
};

export class NextAppAuth extends NextAuth {
  getSession = cache(
    () =>
      new NextAuthSession(
        this.client,
        cookies().get(this.options.authCookieName)?.value.split(";")[0]
      )
  );

  createServerActions() {
    return {
      signout: async () => {
        cookies().delete(this.options.authCookieName);
      },
      emailPasswordSignIn: async (
        data: FormData | { email: string; password: string }
      ) => {
        const [email, password] = _extractParams(
          data,
          ["email", "password"],
          "email or password missing"
        );
        const tokenData = await (
          await this.core
        ).signinWithEmailPassword(email, password);
        cookies().set({
          name: this.options.authCookieName,
          value: tokenData.auth_token,
          httpOnly: true,
          sameSite: "strict",
        });
        return tokenData;
      },
      emailPasswordSignUp: async (
        data: FormData | { email: string; password: string }
      ) => {
        const [email, password] = _extractParams(
          data,
          ["email", "password"],
          "email or password missing"
        );
        const result = await (
          await this.core
        ).signupWithEmailPassword(
          email,
          password,
          `${this._authRoute}/emailpassword/verify`
        );
        cookies().set({
          name: this.options.pkceVerifierCookieName,
          value: result.verifier,
          httpOnly: true,
          sameSite: "strict",
        });
        if (result.status === "complete") {
          cookies().set({
            name: this.options.authCookieName,
            value: result.tokenData.auth_token,
            httpOnly: true,
            sameSite: "strict",
          });
          return result.tokenData;
        }
        return null;
      },
      emailPasswordSendPasswordResetEmail: async (
        data: FormData | { email: string }
      ) => {
        if (!this.options.passwordResetPath) {
          throw new Error(`'passwordResetPath' option not configured`);
        }
        const [email] = _extractParams(data, ["email"], "email missing");
        const { verifier } = await (
          await this.core
        ).sendPasswordResetEmail(
          email,
          new URL(
            this.options.passwordResetPath,
            this.options.baseUrl
          ).toString()
        );
        cookies().set({
          name: this.options.pkceVerifierCookieName,
          value: verifier,
          httpOnly: true,
          sameSite: "strict",
        });
      },
      emailPasswordResetPassword: async (
        data: FormData | { reset_token: string; password: string }
      ) => {
        const verifier = cookies().get(
          this.options.pkceVerifierCookieName
        )?.value;
        if (!verifier) {
          throw new Error("no pkce verifier cookie found");
        }
        const [resetToken, password] = _extractParams(
          data,
          ["reset_token", "password"],
          "reset_token or password missing"
        );
        const tokenData = await (
          await this.core
        ).resetPasswordWithResetToken(resetToken, verifier, password);
        cookies().set({
          name: this.options.authCookieName,
          value: tokenData.auth_token,
          httpOnly: true,
          sameSite: "strict",
        });
        cookies().delete(this.options.pkceVerifierCookieName);
        return tokenData;
      },
      emailPasswordResendVerificationEmail: async (
        data: FormData | { verification_token: string } | { email: string }
      ) => {
        let email;
        let verificationToken;
        try {
          [verificationToken] = _extractParams(
            data,
            ["verification_token"],
            "verification_token missing"
          );
        } catch (tokenError) {
          try {
            [email] = _extractParams(data, ["email"], "email missing");
          } catch (emailError) {
            const bothParamsMissing = [tokenError, emailError]
              .map((err) => (err as Error).message)
              .join(" and ");

            throw new Error(`${bothParamsMissing}. Either one is required.`);
          }
        }

        if (verificationToken) {
          await (await this.core).resendVerificationEmail(verificationToken);
        } else if (email) {
          await (
            await this.core
          ).resendVerificationEmailForEmail(
            email,
            `${this._authRoute}/emailpassword/verify`
          );
        }
      },
    };
  }
}

export default function createNextAppAuth(
  client: Client,
  options: NextAuthOptions
) {
  return new NextAppAuth(client, options);
}
