import { apiRequest } from "./api.js";

const getStoredUser = () => {
  try {
    return JSON.parse(
      localStorage.getItem("user") || "{}"
    );
  } catch {
    return {};
  }
};

const saveUser = (user) => {
  if (!user) {
    return null;
  }

  const existingUser =
    getStoredUser();

  const mergedUser = {
    ...existingUser,
    ...user,
  };

  localStorage.setItem(
    "user",
    JSON.stringify(
      mergedUser
    )
  );

  if (user.userType) {
    localStorage.setItem(
      "echooRole",
      user.userType
    );
  }

  if (
    user.onboardingCompleted ===
    true
  ) {
    localStorage.setItem(
      "echooOnboardingCompleted",
      "true"
    );
  } else if (
    user.onboardingCompleted ===
    false
  ) {
    localStorage.removeItem(
      "echooOnboardingCompleted"
    );
  }

  return mergedUser;
};

const onboardingService = {
  getStatus: async () => {
    const response =
      await apiRequest(
        "/onboarding/status"
      );

    if (
      response?.data?.user
    ) {
      saveUser(
        response.data.user
      );
    }

    if (
      response?.data?.userType
    ) {
      localStorage.setItem(
        "echooRole",
        response.data.userType
      );
    }

    if (
      response?.data
        ?.isOnboardingComplete ===
      true
    ) {
      localStorage.setItem(
        "echooOnboardingCompleted",
        "true"
      );
    }

    return response;
  },

  updateProfile: async (
    userId,
    data
  ) => {
    if (!userId) {
      throw new Error(
        "User ID is missing. Please sign in again."
      );
    }

    const response =
      await apiRequest(
        `/users/${userId}`,
        {
          method: "PATCH",

          body:
            JSON.stringify({
              bio:
                data.bio ??
                "",

              avatar:
                data.avatar ??
                null,

              ...(data.displayName
                ? {
                    displayName:
                      data.displayName,
                  }
                : {}),
            }),
        }
      );

    if (
      response?.data
    ) {
      saveUser(
        response.data
      );
    }

    return response;
  },

  completeProfile: async (data) => {
    const response = await apiRequest('/onboarding/profile-setup', {
      method: 'POST',
      body: JSON.stringify({
        displayName: data.displayName,
        bio: data.bio ?? '',
        avatar: data.avatar ?? null,
      }),
    });

    if (response?.data?.user) saveUser(response.data.user);
    return response;
  },

  activateCreator: async () => {
    const response =
      await apiRequest(
        "/onboarding/activate-creator",
        {
          method: "POST",

          body: JSON.stringify({}),
        }
      );

    if (
      response?.data?.user
    ) {
      saveUser(
        response.data.user
      );
    }

    localStorage.setItem("echooRole", "creator");

    return response;
  },

  chooseCreatorType:
    async (data) => {
      const response =
        await apiRequest(
          "/onboarding/choose-creator-type",
          {
            method:
              "POST",

            body:
              JSON.stringify(
                data
              ),
          }
        );

      if (
        response?.data
          ?.user
      ) {
        saveUser(
          response.data
            .user
        );
      }

      return response;
    },

  updateContentInfo:
    async ({
      category,
      contentDescription,
      genres = [],
    }) => {
      const response =
        await apiRequest(
          "/onboarding/content-info",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                category,
                contentDescription,
                genres,
              }),
          }
        );

      if (
        response?.data
          ?.user
      ) {
        saveUser(
          response.data
            .user
        );
      }

      return response;
    },

  updateOrganizationDetails:
    async (data) => {
      const response =
        await apiRequest(
          "/onboarding/organization-details",
          {
            method:
              "POST",

            body:
              JSON.stringify(
                data
              ),
          }
        );

      if (
        response?.data
          ?.user
      ) {
        saveUser(
          response.data
            .user
        );
      }

      return response;
    },

  complete: async () => {
    const response =
      await apiRequest(
        "/onboarding/complete",
        {
          method: "POST",
        }
      );

    if (
      response?.data?.user
    ) {
      saveUser(
        response.data.user
      );
    }

    localStorage.setItem(
      "echooOnboardingCompleted",
      "true"
    );

    return response;
  },

  refreshStatus:
    async () => {
      return onboardingService.getStatus();
    },

  getLocalUser: () => {
    return getStoredUser();
  },

  isLocallyCompleted:
    () => {
      const user =
        getStoredUser();

      return (
        user.onboardingCompleted ===
          true ||
        localStorage.getItem(
          "echooOnboardingCompleted"
        ) === "true"
      );
    },

  clearOnboardingCache:
    () => {
      localStorage.removeItem(
        "echooRole"
      );

      localStorage.removeItem(
        "echooOnboardingCompleted"
      );

      localStorage.removeItem(
        "echooProfileCompleted"
      );
    },

  saveUser,
};

export default onboardingService;
