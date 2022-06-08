import sequential from 'promise-sequential';
import {
  $TSAny, $TSContext, stateManager,
} from 'amplify-cli-core';
import * as pinpointHelper from './pinpoint-helper';
import {
  IChannelAPIResponse, NotificationsChannelAPIModule,
} from './notifications-api-types';
import { NotificationsDB as Notifications, NotificationsDB } from './notifications-backend-cfg-api';
import { NotificationsMeta } from './notifications-meta-api';

/**
 * Enable the selected notification channel
 */
export const enableChannel = async (context:$TSContext, channelName:string): Promise<IChannelAPIResponse|undefined> => {
  const envName: string = stateManager.getCurrentEnvName() as string; // throws exception if env is not configured
  if (Notifications.ChannelAPI.isValidChannel(channelName)) {
    context.exeInfo.pinpointClient = await pinpointHelper.getPinpointClient(context, 'update', envName);
    const channelActionHandler:NotificationsChannelAPIModule = await import(Notifications.ChannelAPI.getChannelHandlerPath(channelName));
    const enableChannelResponse = await channelActionHandler.enable(context);
    return enableChannelResponse;
  }
  throw new Error(`Enable failed: invalid notification channel ${channelName}`);
};

/**
 * Disable the notification channels in use.
 */
export const disableChannel = async (context : $TSContext, channelName: string): Promise<IChannelAPIResponse|undefined> => {
  const envName: string = stateManager.getCurrentEnvName() as string; // throws exception if env is not configured
  if (Notifications.ChannelAPI.isValidChannel(channelName)) {
    context.exeInfo.pinpointClient = await pinpointHelper.getPinpointClient(context, 'update', envName);
    const channelActionHandler:NotificationsChannelAPIModule = await import(Notifications.ChannelAPI.getChannelHandlerPath(channelName));
    const disableChannelResponse = await channelActionHandler.disable(context);
    return disableChannelResponse;
  }
  return undefined;
};

/**
 * Disable all notifications channels in use
 * @param context amplify-cli context
 * @returns Array of Channel API responses
 */
export const disableAllChannels = async (context: $TSContext): Promise<Array<IChannelAPIResponse>> => {
  const enabledChannels : Array<string> = await Notifications.ChannelAPI.getEnabledChannels(context);
  const responseArray : Array<IChannelAPIResponse> = [];

  // sequentially disable each channel - since persistent context gets updated
  for (const channelName of enabledChannels) {
    const channelAPIResponse = await disableChannel(context, channelName);
    if (channelAPIResponse) {
      responseArray.push(channelAPIResponse);
    }
  }
  return responseArray;
};

/**
 * Call this to remove the notifications category only after all channels have been disabled.
 * @param context Amplify CLI context
 */
export const removeEmptyNotificationsApp = async (context: $TSContext): Promise<$TSContext> => {
  let updatedContext = context;
  const enabledChannels : Array<string> = await Notifications.ChannelAPI.getEnabledChannels(context);
  if (enabledChannels.length > 0) {
    throw new Error(`Cannot remove notifications app, please all channels( [${enabledChannels}] ) and retry`);
  }
  updatedContext = await NotificationsMeta.removeNotificationsAppMeta(updatedContext);
  updatedContext = await NotificationsDB.removeNotificationsAppConfig(updatedContext);
  return updatedContext;
};

/**
 * Configure the Pinpoint resources,
 * Also create the required IAM policy to allow Pinpoint to trigger notifications
 */
export const configureChannel = async (context: $TSContext, channelName: string):Promise<IChannelAPIResponse|undefined> => {
  const envName: string = stateManager.getCurrentEnvName() as string; // throws exception if env is not configured

  if (channelName in Notifications.ChannelAPI.ChannelType) {
    context.exeInfo.pinpointClient = await pinpointHelper.getPinpointClient(context, 'update', envName);
    if (context.exeInfo.serviceMeta.mobileHubMigrated === true) {
      context.print.error('No resources to update.');
      return undefined;
    }

    const channelActionHandler:NotificationsChannelAPIModule = await import(Notifications.ChannelAPI.getChannelHandlerPath(channelName));
    const enableChannelResponse = await channelActionHandler.configure(context);
    return enableChannelResponse;
  }
  return undefined;
};

/**
 * Fetch all the configured channels from pinpoint
 */
export const pullAllChannels = async (context: $TSContext, pinpointAppName: string):Promise<Array<IChannelAPIResponse>> => {
  const envName: string = stateManager.getCurrentEnvName() as string; // throws exception if env is not configured
  const pullTasks: Array<$TSAny> = [];
  context.exeInfo.pinpointClient = await pinpointHelper.getPinpointClient(context, 'update', envName);

  for (const channelName of Object.keys(Notifications.ChannelAPI.ChannelType)) {
    const channelActionHandler:NotificationsChannelAPIModule = await import(Notifications.ChannelAPI.getChannelHandlerPath(channelName));
    pullTasks.push(() => channelActionHandler.pull(context, pinpointAppName));
  }
  const pullChannelsResponseList : Array<IChannelAPIResponse> = await sequential(pullTasks);
  return pullChannelsResponseList;
};