import {
  addNotificationChannel,
  addPinpointAnalytics,
  amplifyPushAuth,
  amplifyStatus,
  createNewProjectDir,
  deleteProject,
  deleteProjectDir,
  getAppId,
  getBackendAmplifyMeta,
  getProjectMeta,
  getTeamProviderInfo,
  initJSProjectWithProfile,
  removeNotificationChannel,
} from '@aws-amplify/amplify-e2e-core';
import { addEnvironment, checkoutEnvironment, removeEnvironment } from '../environment/env';
import {
  getShortId,
} from '../import-helpers';

describe('notifications in-app without existing pinpoint', () => {
  const testChannel = 'InAppMessaging';
  const testChannelSelection = 'In-App Messaging';
  const envName = 'inappnotifstest';
  const projectPrefix = `notification${testChannel}`.substring(0, 19);
  const projectSettings = {
    name: projectPrefix,
    disableAmplifyAppCreation: false,
    envName,
  };

  let projectRoot: string;

  beforeEach(async () => {
    projectRoot = await createNewProjectDir(projectPrefix);
  });

  afterEach(async () => {
    await deleteProject(projectRoot);
    deleteProjectDir(projectRoot);
  });

  it(`should add and remove the ${testChannel} channel correctly with multiple environments (w/ analytics)`, async () => {
    const pinpointResourceName = `${projectPrefix}${getShortId()}`;

    await initJSProjectWithProfile(projectRoot, projectSettings);

    const appId = getAppId(projectRoot);
    expect(appId).toBeDefined();

    // BEGIN - SETUP PINPOINT but don't push
    await addPinpointAnalytics(projectRoot, false, pinpointResourceName);

    // setup channel for in-app messaging
    const settings = { resourceName: `${projectPrefix}${getShortId()}` };
    await addNotificationChannel(projectRoot, settings, testChannelSelection, true, true);

    // push both
    await amplifyPushAuth(projectRoot);

    // expect that Notifications, Analytics, and Auth categories are shown
    await amplifyStatus(projectRoot, 'Notifications');
    await amplifyStatus(projectRoot, 'Analytics');
    await amplifyStatus(projectRoot, 'Auth');

    // InAppMessaging & Analytics meta should exist
    const meta = getBackendAmplifyMeta(projectRoot);
    console.log(meta.analytics);
    console.log(meta.notifications);
    const inAppMessagingMeta = meta.notifications[settings.resourceName]?.output?.InAppMessaging;
    const analyticsMeta = meta.analytics[settings.resourceName]?.output;
    expect(inAppMessagingMeta).toBeDefined();
    expect(analyticsMeta).toBeDefined();
    expect(inAppMessagingMeta.Enabled).toBe(true);
    expect(inAppMessagingMeta.ApplicationId).toEqual(analyticsMeta.Id);

    // pinpointId in team-provider-info should match the analyticsMetaId
    const teamInfo = getTeamProviderInfo(projectRoot);
    console.log(teamInfo[envName].categories);
    const pinpointId = teamInfo[envName].categories?.notifications?.Pinpoint?.Id;
    expect(pinpointId).toBeDefined();
    expect(pinpointId).toEqual(analyticsMeta.Id);

    // make sure we can add new environments
    const newEnvName = 'inappnotifs2';
    await addEnvironment(projectRoot, { envName: newEnvName });
    // new environment should show that we still need to push resources for this environment
    await amplifyStatus(projectRoot, 'Create');
    await amplifyStatus(projectRoot, 'Notifications');
    // remove in-app messaging on this environment
    await removeNotificationChannel(projectRoot, testChannelSelection);
    await amplifyPushAuth(projectRoot);

    // in-app messaging should be disabled in the cloud on this env
    const newEnvCloudBackendMeta = await getProjectMeta(projectRoot);
    const newEnvCloudBackendInAppMsgMeta = newEnvCloudBackendMeta.notifications[settings.resourceName]?.output?.InAppMessaging;
    expect(newEnvCloudBackendInAppMsgMeta).toBeDefined();
    expect(newEnvCloudBackendInAppMsgMeta.Enabled).toBe(false);

    // switch back to the first environment
    await checkoutEnvironment(projectRoot, { envName, restoreBackend: true });
    // in-app messaging should be enabled in the cloud on this env
    const originalEnvCloudBackendMeta = await getProjectMeta(projectRoot);
    const originalEnvCloudBackendInAppMsgMeta = originalEnvCloudBackendMeta.notifications[settings.resourceName]?.output?.InAppMessaging;
    expect(originalEnvCloudBackendInAppMsgMeta).toBeDefined();
    expect(originalEnvCloudBackendInAppMsgMeta.Enabled).toBe(true);

    // delete the 2nd environment
    await removeEnvironment(projectRoot, { envName: newEnvName });

    // resources should still exist on the first environment
    await amplifyStatus(projectRoot, 'Analytics');
    await amplifyStatus(projectRoot, 'Auth');
    await amplifyStatus(projectRoot, 'Notifications');
  });
});