/**
 * Verbatim excerpts from a live Sherdog fighter page, stitched together.
 *
 * Kept as real markup rather than a hand-written approximation, because the
 * whole risk in this parser is that the page does not look the way we remember.
 * A fixture we invented would agree with the parser forever and tell us nothing
 * the day Sherdog changes their template. Trimmed to the blocks the parser
 * reads, so the test stays fast and the repository stays small.
 *
 * Captured August 2026 from /fighter/Conor-McGregor-29688.
 */
export const SHERDOG_PROFILE = `
<div class="fighter-title" contenteditable="false">
 <div class="fighter-line1">
 <div class="fighter-flag-social">
 <div class="fighter-nationality">
 <span class="item birthplace">
 <strong itemprop="nationality">Ireland</strong><br />
 <span itemprop="address" itemscope itemtype="http://schema.org/PostalAddress" class="adr"><span itemprop="addressLocality" class="locality">Dublin</span></span>
 </span>
 <img src="/img/flags/big/ie.png" class="big_flag" alt="Country" />
 </div>
 </div>
 <h1 itemprop="name"><span class="fn">Conor McGregor</span></h1>
 <div class="fighter-line2">
 <h1 itemprop="name"><span class="nickname">"<em>Notorious</em>"</span></h1>
 <div class="share">
 </div>
<div class="bio-holder">
 <table>
 <tr>
 <td>AGE</td>
 <td><b>38</b> <em>/</em> <span itemprop="birthDate">Jul 14, 1988</span>
 </td>
 </tr>
 <tr><td>HEIGHT</td><td><b itemprop="height">5'8"</b> <em>/</em> 172.72 cm</td></tr>
 <tr><td>WEIGHT</td><td><b itemprop="weight">170 lbs</b> <em>/</em> 77.11 kg</td></tr>
 </table>
<div class="association-class">
 ASSOCIATION<br />
 <span itemprop="memberOf" itemscope itemtype="http://www.schema.org/Organization"><a class="association" itemprop="url" href="/stats/fightfinder?association=SBG+Ireland"><span itemprop="name">SBG Ireland</span></a></span> <br /><br />
 CLASS<br />
 <a href="/stats/fightfinder?weightclass=Welterweight">Welterweight</a>
 </div>
<div class="winsloses-holder">
 <div class="wins">
 <div class="winloses win">
 <span>Wins</span>
 <span>22</span>
 </div>
 <div class="meter-title">KO <em>/</em> TKO</div>
<div class="meter">
 <div class="pl">19</div>
 <div class="pr">86%</div>
</div>
 <div class="meter-title">SUBMISSIONS</div>
<div class="meter">
 <div class="pl">1</div>
 <div class="pr">5%</div>
</div>
 <div class="meter-title">DECISIONS</div>
<div class="meter">
 <div class="pl">2</div>
 <div class="pr">9%</div>
</div>
 </div>
 <div class="loses">
 <div class="winloses lose">
 <span>Losses</span>
 <span>7</span>
 </div>
 <div class="meter-title">KO <em>/</em> TKO</div>
 <div class="meter">
 <div class="pl">3</div>
 <div class="pr">43%</div>
 </div>
 <div class="meter-title">SUBMISSIONS</div>
 <div class="meter">
 <div class="pl">4</div>
 <div class="pr">57%</div>
 </div>
 <div class="meter-title">DECISIONS</div>
 <div class="meter">
 <div class="pl">0</div>
 <div class="pr">0%</div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 </section>
 <section>
 <div class="tiled_bg latest_features">
 <div class="slanted_title">
 <div>FIGHT HISTORY - AMATEUR</div>
 <div></div>
 </div>
</div>
 <div class="module fight_history">
 <div class="new_table_holder">
 <table class="new_table fighter" border="1">
 <tr class="table_head">
 <td class="col_one">Result</td>
 <td class="col_two">Fighter</td>
 <td class="col_three">Event</td>
 <td class="col_four">Method/<wbr/>Referee</td>
 <td class="col_five">R</td>
 <td class="col_six">Time</td>
 </tr>
 <tr>
 <td><span class="final_result win">win</span></td>
 <td><a href="/fighter/Ciaran-Campbell-115769">Ciaran Campbell</a></td>
 <td><a href="/events/ROT-Ring-of-Truth-6-8321"><span itemprop="award">ROT - Ring of Truth 6</span></a><br /><span class="sub_line">Feb / 17 / 2007</span></td>
 <td class="winby"><b>TKO (Punches)</b><br /><span class="sub_line">David Jones</span></td>
 <td>1</td>
 <td>1:31</td>
 </tr>
 </table>
`;

/**
 * The same page shape for somebody with a real amateur record and no
 * professional one, which is the actual case this feature serves. Row markup is
 * copied from the fixture above; only the results and methods differ.
 */
export const SHERDOG_AMATEUR_ONLY = `
 <h1 itemprop="name"><span class="fn">Owen Pryce</span></h1>
<div class="bio-holder">
 <table>
 <tr><td>AGE</td><td><b>21</b> <em>/</em> <span itemprop="birthDate">Mar 2, 2005</span></td></tr>
 <tr><td>HEIGHT</td><td><b itemprop="height">5'8"</b> <em>/</em> 174.00 cm</td></tr>
 </table>
<div class="association-class">
 ASSOCIATION<br />
 <span itemprop="memberOf" itemscope itemtype="http://www.schema.org/Organization"><a class="association" itemprop="url" href="/stats/fightfinder?association=Bryn+Athletic"><span itemprop="name">Bryn Athletic</span></a></span>
 </div>
 <div>FIGHT HISTORY - AMATEUR</div>
 <table class="new_table fighter" border="1">
 <tr class="table_head"><td class="col_one">Result</td></tr>
 <tr>
 <td><span class="final_result win">win</span></td>
 <td class="winby"><b>TKO (Punches)</b></td>
 </tr>
 <tr>
 <td><span class="final_result win">win</span></td>
 <td class="winby"><b>Decision (Unanimous)</b></td>
 </tr>
 <tr>
 <td><span class="final_result loss">loss</span></td>
 <td class="winby"><b>Submission (Armbar)</b></td>
 </tr>
 <tr>
 <td><span class="final_result draw">draw</span></td>
 <td class="winby"><b>Draw</b></td>
 </tr>
 </table>
`;
