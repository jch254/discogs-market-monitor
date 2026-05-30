import { Context } from 'aws-lambda';
import { GetWantlistResult, MarketMonitorEvent } from './interfaces';
import { debugLog } from './utils';
import { getDiscogsClientForMonitor, getUserWantlist } from './wrappedDiscogsClient';

// Step 1 of the Step Functions workflow: fetch the wantlist once and fan it out
// into one (userId, releaseId) task per release for the Distributed Map.
export async function handler(
  event: MarketMonitorEvent,
  _context: Context,
): Promise<GetWantlistResult> {
  const {
    username,
    shipsFrom,
    destinationEmail,
    discogsToken,
    discogsOAuthToken,
    discogsOAuthTokenSecret,
  } = event;

  console.log('GETTING WANTLIST FOR MARKET MONITOR', { username, shipsFrom });

  // Scope the client to the registered user's auth so private wantlists work.
  const discogsClient = getDiscogsClientForMonitor({
    discogsToken,
    discogsOAuthToken,
    discogsOAuthTokenSecret,
  });

  const { wantlistReleases } = await getUserWantlist(discogsClient, username);

  const items = wantlistReleases.map(release => ({
    userId: username,
    releaseId: release.basic_information.id,
    title: `${release.basic_information.artists
      .map(artist => artist.name)
      .join(', ')} - ${release.basic_information.title}`,
    shipsFrom,
    destinationEmail,
  }));

  debugLog('GETWANTLIST PRODUCED RELEASE TASKS', {
    username,
    itemCount: items.length,
  });

  return { username, shipsFrom, destinationEmail, items };
}
