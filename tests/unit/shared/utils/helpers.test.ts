import { prepareEnvVars, uniqueFilter } from "../../../../src/shared/utils/helpers";

describe("Helpers", () => {
  describe("uniqueFilter", () => {
    it("should filter duplicate values from array", () => {
      const arr = [1, 2, 2, 3, 4, 4, 5];
      const result = arr.filter(uniqueFilter);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it("should filter duplicate strings", () => {
      const arr = ["a", "b", "a", "c", "b"];
      const result = arr.filter(uniqueFilter);

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should handle empty array", () => {
      const arr: string[] = [];
      const result = arr.filter(uniqueFilter);

      expect(result).toEqual([]);
    });

    it("should handle array with no duplicates", () => {
      const arr = [1, 2, 3, 4, 5];
      const result = arr.filter(uniqueFilter);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it("should handle array with all duplicates", () => {
      const arr = ["same", "same", "same"];
      const result = arr.filter(uniqueFilter);

      expect(result).toEqual(["same"]);
    });

    it("should preserve order of first occurrence", () => {
      const arr = ["first", "second", "first", "third", "second"];
      const result = arr.filter(uniqueFilter);

      expect(result).toEqual(["first", "second", "third"]);
    });
  });

  describe("prepareEnvVars", () => {
    it("should convert env object with string values", () => {
      const customEnv = { CUSTOM_VAR: "value" };

      const result = prepareEnvVars(customEnv);

      expect(result).toEqual({
        CUSTOM_VAR: "value",
      });
    });

    it("should filter out null values and convert to undefined", () => {
      const customEnv = { VAR1: "value1", VAR2: null, VAR3: "value3" };

      const result = prepareEnvVars(customEnv);

      expect(result.VAR1).toBe("value1");
      expect(result.VAR2).toBeUndefined();
      expect(result.VAR3).toBe("value3");
      expect(result).toEqual({ VAR1: "value1", VAR2: undefined, VAR3: "value3" });
    });

    it("should return empty object for undefined input", () => {
      const result = prepareEnvVars(undefined);

      expect(result).toEqual({});
    });

    it("should return empty object for empty input object", () => {
      const result = prepareEnvVars({});

      expect(result).toEqual({});
    });

    it("should preserve string values without modification", () => {
      const customEnv = { PATH: "/custom/path", HOME: "/home" };

      const result = prepareEnvVars(customEnv);

      expect(result.PATH).toBe("/custom/path");
      expect(result.HOME).toBe("/home");
    });

    it("should filter out multiple null values", () => {
      const customEnv = {
        VAR1: null,
        VAR2: null,
        VAR3: "value",
        VAR4: null,
      };

      const result = prepareEnvVars(customEnv);

      expect(result.VAR1).toBeUndefined();
      expect(result.VAR2).toBeUndefined();
      expect(result.VAR3).toBe("value");
      expect(result.VAR4).toBeUndefined();
    });

    it("should handle mixed null and string values", () => {
      const customEnv = {
        HOME: "/home/user",
        TEMP: null,
        USER: "testuser",
        EMPTY: null,
      };

      const result = prepareEnvVars(customEnv);

      expect(result.HOME).toBe("/home/user");
      expect(result.TEMP).toBeUndefined();
      expect(result.USER).toBe("testuser");
      expect(result.EMPTY).toBeUndefined();
    });

    it("should return empty result when no env vars provided", () => {
      const result = prepareEnvVars(undefined);

      expect(Object.keys(result).length).toBe(0);
      expect(result).toEqual({});
    });

    it("should handle empty string values", () => {
      const customEnv = { VAR1: "", VAR2: "value" };

      const result = prepareEnvVars(customEnv);

      expect(result.VAR1).toBe("");
      expect(result.VAR2).toBe("value");
    });

    it("should not mutate original input object", () => {
      const customEnv = { CUSTOM: "value", NULL_VAR: null };
      const originalCustomEnv = { ...customEnv };

      prepareEnvVars(customEnv);

      expect(customEnv).toEqual(originalCustomEnv);
    });

    describe("real-world scenarios", () => {
      it("should handle Homebrew color flag", () => {
        const customEnv = { HOMEBREW_COLOR: "1" };

        const result = prepareEnvVars(customEnv);

        expect(result.HOMEBREW_COLOR).toBe("1");
      });

      it("should handle simulator child env vars", () => {
        const customEnv = {
          SIMCTL_CHILD_DEBUG: "1",
          SIMCTL_CHILD_LOG_LEVEL: "verbose",
        };

        const result = prepareEnvVars(customEnv);

        expect(result.SIMCTL_CHILD_DEBUG).toBe("1");
        expect(result.SIMCTL_CHILD_LOG_LEVEL).toBe("verbose");
      });

      it("should handle device child env vars", () => {
        const customEnv = {
          DEVICECTL_CHILD_ENV1: "value1",
          DEVICECTL_CHILD_ENV2: "value2",
        };

        const result = prepareEnvVars(customEnv);

        expect(result.DEVICECTL_CHILD_ENV1).toBe("value1");
        expect(result.DEVICECTL_CHILD_ENV2).toBe("value2");
      });

      it("should remove variables by setting to null", () => {
        const customEnv = {
          SOME_VAR: "value",
          VAR_TO_REMOVE: null,
        };

        const result = prepareEnvVars(customEnv);

        expect(result.SOME_VAR).toBe("value");
        expect(result.VAR_TO_REMOVE).toBeUndefined();
      });
    });
  });
});
