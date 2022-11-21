import React from 'react';
import moment from 'moment';

// The match: https://www.hltv.org/matches/2352820/natus-vincere-vs-vitality-blast-premier-fall-final-2021 

interface MatchLine {
    isPlayer: boolean;
    isWarmup: boolean;
    steamId: string;
    team: string;
    type: string;
    interactionData: InteractionData;
    roundNumber: number;
    raw: string;
}

interface InteractionData {
    damage: number;
    teamDamage: boolean;
    kill: boolean;
    assist: boolean;
    killed: string;
}

interface Player {
    steamId: string;
    alias: string;
}

interface Team {
    name: string;
}

interface Round {
    number: number;
}

interface PlayerStats {
    player: Player;
    kills: number;
    deaths: number;
    assists: number;
    damage: number;
    teamDamage: number;
    atdr?: number;
    adr?: number;
    kpr?: number;
    dpr?: number;
}

interface RoundStats {
    roundNumber: number;
    score: {},
    playerStats?: any;
    roundTime: string;
}

interface State {
    loading: boolean;
    players: Player[];
    teams: Team[];
    rounds: Round[];
    roundStats: RoundStats[];
    matchLines: MatchLine[];
}

class App extends React.Component <any, State> {
    state = {
        loading: true,
        matchLines: [],
        players: [],
        rounds: [],
        teams: [],
        roundStats: [],
    };

    loading = () => {
        this.setState({'loading': !this.state.loading});
    }

    calculateStats = () => {
        const roundStatsCollection : RoundStats[] = [];
        const playerStats = this.getDefaultPlayerStats();
        const score: {[key: string]: number} = {}
        const team1 : Team = this.state.teams[0];
        const team2 : Team = this.state.teams[1];

        score[team1.name] = 0;
        score[team2.name] = 0;

        this.state.rounds.forEach((round: Round) => {
            var roundLines : MatchLine[] = this.state.matchLines
                .filter((line: MatchLine) => line.roundNumber === round.number);

            var roundTimes = roundLines.filter((line: MatchLine) => {
                return line.type === 'round_start' || line.type === 'round_end' ;
            }).map(function(line: MatchLine) {
                return line.raw.substring(0,21);
            });

            var startTime = moment(roundTimes[0], 'MM/DD/YYYY - HH:mm:ss');
            var endTime = moment(roundTimes[1], 'MM/DD/YYYY - HH:mm:ss');
            var roundTime = moment(endTime.diff(startTime)).format("mm:ss");

            let ct = '';
            let t = '';

            roundLines.filter((line: MatchLine) => line.type === 'team_determination')
                .forEach((line: MatchLine) => {
                    const ctMatches = line.raw.match('(?<="CT": ).([^:]*)$');
                    const tMatches = line.raw.match('(?<="TERRORIST": ).([^:]*)$');

                    if (ctMatches && ctMatches.length !== 0) {
                        ct = ctMatches![0]
                    }
                    if (tMatches && tMatches.length !== 0) {
                        t = tMatches![0]
                    }
                });

            roundLines.forEach((line: MatchLine) => {
                    if (line.type === 'round_win_t' || line.type === 'round_win_ct') {
                        var winningTeam = line.type.replace('round_win_', '');

                        if (winningTeam === 't') {
                            score[t]++;
                        }
                        if (winningTeam === 'ct') {
                            score[ct]++;
                        }
                    }

                    if (line.type === 'interaction') {
                        if (line.interactionData.kill) {
                            playerStats[line.steamId].kills++;
                            playerStats[line.interactionData.killed].deaths++;
                        }
                        if (line.interactionData.assist) {
                            playerStats[line.steamId].assists++;
                        }
                        playerStats[line.steamId].damage += Number(line.interactionData.damage);
                        playerStats[line.steamId].teamDamage += line.interactionData.teamDamage ? line.interactionData.damage : 0;
                        playerStats[line.steamId].atdr = playerStats[line.steamId].teamDamage / round.number;
                        playerStats[line.steamId].adr = playerStats[line.steamId].damage / round.number;
                        playerStats[line.steamId].kpr = playerStats[line.steamId].kills / round.number;
                        playerStats[line.steamId].dpr = playerStats[line.steamId].deaths / round.number;
                    }
                });

            let playerStatsRound = JSON.parse(JSON.stringify(playerStats));

            let roundStats: RoundStats = {
                'roundNumber': round.number,
                'score': {...score},
                'playerStats': {...playerStatsRound},
                'roundTime': roundTime,
            };

            roundStatsCollection.push(roundStats);
        });

        this.setState({
            roundStats: roundStatsCollection
        }, this.loading);
    }

    getDefaultPlayerStats = () => {
        const stats: {[key: string]: PlayerStats} = {};

        this.state.players.forEach((player: Player) => {
            var playerStats: PlayerStats = {
                'player': player,
                'kills': 0,
                'deaths': 0,
                'damage': 0,
                'teamDamage': 0,
                'assists': 0,
            };

            stats[player.steamId] = playerStats;
        });

        return stats;
    }

    setPlayersAndTeams = () => {
        const players : Player[] = [];

        this.state.matchLines
            .filter((line: MatchLine) => {
                return line.isPlayer && !line.isWarmup && line.type === 'interaction';
            })
            .forEach((line: MatchLine) => {
                const isKnownPlayer = players.find((player: Player) => {
                    return player.steamId === line.steamId;
                });

                if (!isKnownPlayer) {
                    const aliasMatches = line.raw.match('(?<=\\")[^<]*');
                    const newPlayer: Player = {
                        'steamId': line.steamId,
                        'alias': aliasMatches![0]
                    };

                    players.push(newPlayer);
                }
            });

        const teams : Team[] = [];

        this.state.matchLines
            .filter((line: MatchLine) => {
                return line.type === 'team_determination';
            })
            .forEach((line: MatchLine) => {
                const matches = line.raw.match('([^:]*)$');
                const teamName = matches![0].trim();

                const isKnownTeam = teams.find((team: Team) => {
                    return team.name === teamName;
                });

                if (!isKnownTeam) {
                    const newTeam: Team = {
                        'name': teamName
                    };

                    teams.push(newTeam);
                }
            });

        this.setState({
            players: players,
            teams: teams,
        }, this.calculateStats);
    }

    processMatchLines = (data: string) => {
        var lines = data.split('\n');

        // Find last Match_Start.
        var reversedLines = data.split('\n').reverse().join('\n');
        var matchStartIndex = reversedLines.indexOf('Match_Start');
        var tempString = reversedLines.substring(0, matchStartIndex);
        var MatchStartLineNumber = lines.length - tempString.split('\n').length;

        const matchLines : MatchLine[] = [];
        const rounds : Round[] = [];
        let roundNumber = 1;

        for (var line = 0; line < lines.length; line++) {
            let currentLine = lines[line].substring(24);
            let steamId = this.determineMatchLineSteamId(currentLine);
            let isPlayer = steamId !== '';
            let isWarmup = line < MatchStartLineNumber;
            let type = this.determineMatchLineType(currentLine);
            let team = this.determineMatchLineTeam(currentLine);
            let interactionData = this.getInteractionData(currentLine, team, steamId);

            let lineObject: MatchLine = {
                'isPlayer': isPlayer,
                'isWarmup': isWarmup,
                'steamId': steamId,
                'team': team,
                'type': type,
                'interactionData': interactionData,
                'roundNumber': isWarmup ? 0 : roundNumber,
                'raw': lines[line],
            }

            if (!isWarmup && type === 'round_end') {
                let newRound: Round = {
                    'number': roundNumber,
                };
                rounds.push(newRound);

                roundNumber++;
            }

            matchLines.push(lineObject);
        }

        this.setState({
            matchLines: [...this.state.matchLines, ...matchLines],
            rounds: [...this.state.rounds, ...rounds]
        }, this.setPlayersAndTeams);
    }

    getInteractionData = (line: string, team: string, steamId: string) => {
        let damageMatches = line.match('(?<=\\(damage ")[^"]*');

        const regex = team === 'CT' ? /<CT>/g : /<TERRORIST>/g
        let teamCounts = line.match(regex);
        let isTeamDamage = teamCounts && teamCounts.length > 1 ? true : false;

        let killMatches = line.match('^(?!.*(other)).*killed.*$');
        let isKill = false;
        let killed = '';

        if (killMatches && killMatches.length !== 0) {
            isKill = true;

            let killedSteamId = line.match('STEAM_[^>]*(?!.*STEAM_)');

            if (killedSteamId && killedSteamId.length !== 0) {
                killed = killedSteamId[0];
            }
        }

        let assistMatches = line.match('^(?!.*(flash-)).*assisted killing.*$');
        let isAssist = false;

        if (assistMatches && assistMatches.length !== 0) {
            isAssist = true;
        }

        let interaction: InteractionData = {
            'damage': damageMatches ? Number(damageMatches[0]) : 0,
            'teamDamage': isTeamDamage,
            'kill': isKill,
            'assist': isAssist,
            'killed': killed,
        }

        return interaction;
    }

    determineMatchLineSteamId = (line: string) => {
        let matches = line.match('STEAM_[^>]*');

        if (!matches) {
            return '';
        }

        return matches[0];
    }

    determineMatchLineTeam = (line: string) => {
        if (line.match(/<CT>|<TERRORIST>/)) {
            return line.includes('<CT>') ? 'CT' : 'T';
        }

        return '';
    }

    determineMatchLineType = (line: string) => {
        if (line.match(/killed|attacked|assisted killing/)) {
            return 'interaction';
        }
        if (line.match(/Round_End/)) {
            return 'round_end';
        }
        if (line.match(/Round_Start/)) {
            return 'round_start';
        }
        if (line.match(/SFUI_Notice_Terrorists_Win|SFUI_Notice_Target_Bombed/)) {
            return 'round_win_t';
        }
        if (line.match(/SFUI_Notice_CTs_Win|SFUI_Notice_Bomb_Defused/)) {
            return 'round_win_ct';
        }
        if (line.match(/Team playing/)) {
            return 'team_determination';
        }

        return 'meta';
    }

    componentDidMount() {
        const file = require("./matchdata/match.txt");

        fetch(file)
            .then((response) => response.text())
            .then((data) => {
                this.processMatchLines(data);
            });
    }

    render() {
        if (this.state.loading) {
            return (
                <div className="box has-text-centered">
                    <div className="notification is-info">
                        Loading ...
                    </div>
                </div>
            );
        }
        else {
            return (
                <div className="container">
                    <div className="box">
                        { this.state.roundStats.map(function(roundStats: RoundStats) {
                            const scores : any[] = [];
                            const playerStats : any[] = [];

                            Object.entries(roundStats.score).map(([team, wins]) => {
                                return scores.push(`${team}: ${wins}`);
                            });

                            Object.entries(roundStats.playerStats).map(([steamId, stats]) => {
                                return playerStats.push(stats);
                            });

                            return <div className="box" key={roundStats.roundNumber}>
                                <h4 className="title is-4">Round: {roundStats.roundNumber}</h4>
                                <p><strong>Time:</strong> {roundStats.roundTime}</p>
                                { scores.map((score, i) => <p key={i}>{score}</p>) }

                                <table className="table is-striped is-hoverable is-narrow">
                                    <thead>
                                        <tr>
                                            <td></td>
                                            <td>Kills</td>
                                            <td>Deaths</td>
                                            <td>Assists</td>
                                            <td>KPR</td>
                                            <td>DPR</td>
                                            <td>ADR</td>
                                            <td>ATDR</td>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        { playerStats.sort((a, b) => b.kills - a.kills).map(function(playerStats: PlayerStats, key) {
                                            return <tr key={key}>
                                                <td>{playerStats.player.alias}</td>
                                                <td>{playerStats.kills}</td>
                                                <td>{playerStats.deaths}</td>
                                                <td>{playerStats.assists}</td>
                                                <td>{playerStats.kpr?.toFixed(2) ?? 0}</td>
                                                <td>{playerStats.dpr?.toFixed(2) ?? 0}</td>
                                                <td>{playerStats.adr?.toFixed(2) ?? 0}</td>
                                                <td>{playerStats.atdr?.toFixed(2) ?? 0}</td>
                                            </tr>
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        })}
                    </div>
                </div>
            );
        }
    }
}

export default App;
