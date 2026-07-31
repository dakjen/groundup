// Courses 5-7 — authored from Dr. Merritt's webinar series intake docs
const NEW_COURSES = [
  {
    "id": "mc5",
    "title": "Why Affordable Housing Doesn't Pencil: Land, the Gap, and the Case for Subsidy",
    "stage": "Stage 4 of 7",
    "stageColor": "#b8564a",
    "duration": "~50 min",
    "description": "Why does the identical building pencil at market rate and collapse as affordable housing? This course walks the economics from the ground up — land value, the per-unit gap, and the case for subsidy — so you can argue the numbers in a room full of skeptics.",
    "lessons": [
      {
        "id": 1,
        "title": "What Land Is Actually Worth",
        "summary": "Before you fall in love with a site, you have to answer one question: what is this land actually worth to me? Not what the seller thinks it's worth. Not what the tax assessment says. What it is worth based on what you are allowed to build there and what that building will earn once it is standing.\n\nThe analysis that answers this is called highest and best use. You start with the zoning, because that tells you what the law allows. Then you look wider. You read the city's comprehensive plan to see what is intended for that neighborhood over the next twenty years. You read whatever small area plan exists. You find out whether a rail station or a new bus line is coming, because transit changes what a site can carry. You look at whether the population is growing, whether rents and sale prices are rising, and how fast.\n\nSome developers only build one thing — office, or retail, or housing — and they will pass on a site zoned for something they don't do. Others look at the market and decide the site has more potential than its current zoning allows. That is when a rezoning enters the picture.\n\nOnce you know what makes sense to build, you price it. You estimate the cost of construction. You add your soft costs — architects, engineers, market analysis, financing application fees, building permit fees, and the attorneys you will need if you are pursuing a rezoning. Then you build in your profit, and understand what that profit is really doing: it is covering the salaries and the operating expenses of your company, not just rewarding you for the deal.\n\nAdd all of that up and subtract it from the maximum value the finished project can support. What is left over is the residual land value. That is the number you can afford to pay for the dirt.\n\nNotice which direction the math runs. You do not start with an asking price and work forward to see whether you can make it work. You start with what the finished building can support and work backward to the land. The land price is an output of your model. It was never an input.",
        "takeaways": [
          "Highest and best use asks what a site can support — not what the seller is asking for it.",
          "Zoning, the comprehensive plan, small area plans, and planned transit all feed the analysis.",
          "Residual land value = maximum supportable project value minus total cost, including profit.",
          "Your profit line has to carry your company's salaries and overhead, not just the deal.",
          "Land price is the output of the model. Run the numbers before you hear the ask."
        ],
        "quote": "Look, it really is all about making money. Really, that is the bottom line. What's the point of running any business, right?",
        "quoteContext": "Mission-driven developers often feel they shouldn't talk plainly about returns. Dr. Merritt refuses that framing. The valuation math is identical whether you are building luxury condominiums or deeply affordable family housing — and you have to be fluent in it before you can credibly argue for subsidy. Knowing the numbers is not a betrayal of the mission. It is the prerequisite for it.",
        "actionItem": "Pick one site in your target market. Look up its zoning, calculate the maximum buildable square footage, and write down what you would have to build there for the project to work. Do not look up the asking price until after you have finished."
      },
      {
        "id": 2,
        "title": "The Same Building, Two Different Worlds",
        "summary": "Now run that same residual land value analysis twice — once on a market-rate project, once on an affordable one — and watch what happens.\n\nStart with market rate. The project costs $120 million all in, including environmental remediation and the infrastructure work the site needs, plus the building itself. Based on the rents it will collect, the finished project can support $200 million in financing. Subtract the cost from what it can carry and the residual land value is $80 million. That is what the developer can pay for the land and still build a few hundred apartments.\n\nNow the affordable project. Seventy units. It costs $20 million to build, and it has environmental and infrastructure needs of its own that have to be addressed. But the rents are set by what the residents can pay, and against those rents the developer can only borrow $3.5 million.\n\nSubtract $20 million from $3.5 million and the residual land value is negative $16.5 million.\n\nSit with the negative number, because it is not a rounding error or a bad deal. It is what the arithmetic produces every time. The land is essentially worth nothing when you build affordable housing — you cannot afford to pay anything for it, because you can only borrow against rents that were deliberately set below market.\n\nAnd here is the part that no amount of good intentions will move: the construction cost does not change. Concrete, steel, labor, and permits cost what they cost. The building costs $20 million to put up regardless of who is going to live in it.",
        "table": {
          "title": "Residual Land Value: Market-Rate vs. Affordable",
          "headers": [
            "",
            "Market-rate",
            "Affordable (70 units)"
          ],
          "rows": [
            [
              "Total development cost",
              "$120,000,000",
              "$20,000,000"
            ],
            [
              "Supportable financing",
              "$200,000,000",
              "$3,500,000"
            ],
            [
              "Residual land value",
              "$80,000,000",
              "–$16,500,000"
            ]
          ]
        },
        "stats": [
          {
            "value": "+$80M",
            "label": "Market-rate residual land value"
          },
          {
            "value": "–$16.5M",
            "label": "Affordable residual land value"
          },
          {
            "value": "$20M",
            "label": "Cost to build — regardless of rents"
          }
        ],
        "takeaways": [
          "The same analysis produces +$80M on a market-rate deal and –$16.5M on an affordable one.",
          "Construction cost is set by the construction market. It is indifferent to your rents.",
          "A negative residual land value means the project cannot buy its own site.",
          "This is why affordable deals so often need land donated, written down, or contributed by a partner.",
          "Every affordable housing financing tool in existence was built to close this specific distance."
        ],
        "quote": "This is why affordable housing is so difficult to build — because the building costs $20 million, whether or not people are paying $5,000 rent or $500 rent.",
        "quoteContext": "This is the thesis of the entire course in one sentence, and it is worth memorizing. Costs are set by the construction market. Revenue is set by what your residents can afford. Nothing in between reconciles the two. Once a student truly absorbs that, every financing tool in Stage 3 stops looking like a grab bag of programs and starts looking like what it is — a set of instruments engineered to bridge one specific, structural, unavoidable gap.",
        "actionItem": "Take the site from Lesson 1 and run residual land value twice: once at market rents, once at 60% AMI rents. Write down the difference between the two numbers. That difference is your gap, and everything that follows is about filling it."
      },
      {
        "id": 3,
        "title": "Where the Gap Comes From",
        "summary": "Lesson 2 showed the gap at the project level. Now go down to a single apartment, because that is where it becomes impossible to argue with.\n\nAffordable rents are not chosen by the developer. They are calculated from area median income using a standard set by the Department of Housing and Urban Development: a household should not pay more than 30% of its income toward housing. Run that backward and you get the maximum rent a unit can charge at any given income tier.\n\nIn the market this webinar was recorded for, the median rent on a three-bedroom was $1,725 a month. The rent at 80% of area median income was $1,828 — essentially the same. To afford either one under the 30% standard, a household needed to earn close to $75,000 a year. That is the first uncomfortable finding: in that market, the median rent was already an 80% AMI rent. The market by itself was serving nobody below it.\n\nNow build the unit. At an assumed construction cost of $275 per square foot, a three-bedroom costs $343,750 to deliver. Against the rent that unit can legally charge, minus what it costs to operate, the developer can borrow $72,514.\n\nThat leaves $271,236 unfunded. On a single apartment. Roughly 80% of what it cost to build.\n\nNo single program fills a hole that size. This is why affordable housing deals stack four, six, sometimes ten sources on top of each other, and why closing one takes years rather than months. The gap is not evidence of a badly structured deal. The gap is the deal.\n\nIt is also why the government builds financing programs at all. Left to the private market on these numbers, the unit simply does not get built — not because nobody wants to build it, but because there is no lawful way to finance 79% of it.\n\nA note on the figures: these dollar amounts come directly from Dr. Merritt's original presentation and reflect that market at the time of recording. They are used here as a worked example, not as current benchmarks. Construction costs have risen substantially since — which means the gap demonstrated here is conservative against today's numbers, not overstated.",
        "table": {
          "title": "The Gap, One Three-Bedroom Unit at a Time",
          "headers": [
            "Per three-bedroom unit",
            "Amount",
            "Share of cost"
          ],
          "rows": [
            [
              "Cost to build",
              "$343,750",
              "100%"
            ],
            [
              "Supportable debt from rent",
              "$72,514",
              "21%"
            ],
            [
              "Funding gap",
              "$271,236",
              "79%"
            ]
          ]
        },
        "stats": [
          {
            "value": "$343,750",
            "label": "Cost to build one 3BR unit"
          },
          {
            "value": "$72,514",
            "label": "Debt the rent can support"
          },
          {
            "value": "79%",
            "label": "Of the unit's cost is unfunded"
          }
        ],
        "takeaways": [
          "HUD's affordability standard: no more than 30% of household income toward housing.",
          "Affordable rent is derived from area median income — never from what the building cost.",
          "In the worked example, rent supports roughly 21% of the cost to build the unit.",
          "The remaining ~79% is the funding gap, and it exists on every single unit.",
          "Gaps this large require layered sources. No one program closes them."
        ],
        "quote": "The government sponsors financing programs to help build affordable housing — or honestly, no one would build it, because it is so hard to finance.",
        "quoteContext": "Public financing is usually argued about as a matter of generosity or ideology. Dr. Merritt reframes it as arithmetic. When 79% of a unit's cost has no revenue standing behind it, subsidy is not a handout — it is the only mechanism by which the unit comes into existence. Students who can walk a skeptic through this math are far better equipped in a funding meeting than students who can only assert that housing matters.",
        "actionItem": "Pull the HUD income limits for your county. Calculate the maximum allowable rent for a three-bedroom at 60% AMI, estimate the debt that rent supports, and compare it against what it costs to build a three-bedroom in your market today. Write the gap down as a dollar figure per unit."
      },
      {
        "id": 4,
        "title": "What You Actually Earn",
        "summary": "If the gap is that large and the rents are that constrained, a fair question follows: how does anyone make a living doing this?\n\nStart with what does not happen. In market-rate development, equity investors put cash at risk and get paid last — after operating expenses, after debt service — and in exchange they take the largest share of whatever cash is left. That structure barely exists in affordable housing, because there generally isn't enough cash left to reward it. Owners and developers of 100% affordable projects typically do not put their own money in once construction starts, for the straightforward reason that it would earn no return. Tax credit equity exists precisely to fill the role that conventional equity cannot.\n\nThen look at the cash flow. A deal carrying four or six layers of debt uses essentially all of its cash flow to service that debt. There is very little left, and what remains is spoken for. You are not buying an income stream.\n\nSo what do you earn? The developer fee. Generally, in the first fifteen years of a project, the developer fee is the only money the developer makes. You are being paid a fee for the service of delivering affordable housing — and only after the debt is eventually paid down does the project itself begin to produce anything for you.\n\nNow put that against the risk. During the speculative period — entitlement, design, financing applications, permits — a developer can spend somewhere between $1 million and $4 million before a single construction dollar has closed. If the rezoning fails, if the financing doesn't come together, if the permit stalls, that money is simply gone.\n\nThis is the honest shape of the business. It is fee-driven, front-loaded with risk, and slow to reward. Understanding that is not discouragement — it is what lets you price your fee properly, staff realistically, and keep enough deals moving at once that the fees actually add up to a company.",
        "stats": [
          {
            "value": "15 yrs",
            "label": "Before a project pays you anything beyond the fee"
          },
          {
            "value": "$1–$4M",
            "label": "Spent speculatively before construction closes"
          }
        ],
        "takeaways": [
          "Conventional equity returns don't exist in 100% affordable deals — which is why tax credit equity does.",
          "Layered debt consumes nearly all project cash flow; distributions are not the business model.",
          "The developer fee is generally the only money earned in the first fifteen years.",
          "$1–$4 million can be spent speculatively before construction financing ever closes.",
          "Price your fee and plan your pipeline around fee timing, not around distributions."
        ],
        "quote": "Generally, the only money you really make as a developer in the first 15 years of a project is the developer fee. You get a fee essentially for the service of providing affordable housing.",
        "quoteContext": "This reframes what the business actually is. An affordable housing developer is not acquiring an income-producing asset — they are being compensated for delivering a public good, and carrying years of speculative risk to do it. That reality should shape how a student prices their fee, how many deals they keep in the pipeline, and how they explain their business to a partner or a lender who assumes real estate means cash flow.",
        "actionItem": "Look up your state's QAP developer fee cap. Calculate the fee on a hypothetical 50-unit deal, then divide it by the number of years from predevelopment through stabilization. That annual figure is what one deal contributes to your company — and it tells you how many deals you need running at once."
      }
    ]
  },
  {
    "id": "mc6",
    "title": "Zoning, Entitlements & What You're Allowed to Build",
    "stage": "Stage 5 of 7",
    "stageColor": "#e0c4c4",
    "duration": "~45 min",
    "description": "What you're allowed to build decides what the deal is worth. Zoning, rezonings, entitlements, and the community process — how to read the rules, change them when you have to, and come out with a project the neighborhood backs.",
    "lessons": [
      {
        "id": 1,
        "title": "Matter of Right: What You Can Build Without Asking",
        "summary": "There are two kinds of development projects. There are the ones where you already have permission, and the ones where you have to go get it. Knowing which one you are looking at changes your timeline, your budget, and your risk before you have drawn a single line.\n\nA matter of right project is one the law already allows. Your property's zoning permits what you want to build, so you prepare your plans, submit your permit drawings, and as long as the plans conform to what the code allows, you build. Most jurisdictions require a plan approval and nothing more. Nine times out of ten those projects go through with no challenge.\n\nHere is the part that surprises people: public input is typically not required. No hearing. No community meeting you are obligated to hold. And the reasonable question is — should the public not have a say in every project that gets built?\n\nIt is a fair idea. But history answers it. There is always someone, or some group, that opposes development of any kind. If every project required public consent to proceed, nothing would get built at all.\n\nSo the input happens earlier, and at a different scale. Governments work with communities in advance of development to build neighborhood plans, gathering what residents want to see over time. They balance that against the demand for housing, businesses, institutions, and services the area actually needs. Then they zone the land to match. The public process already happened — it happened when the zoning was written, not when your permit was filed.\n\nThat reframes what zoning is. It is not an obstacle placed in front of your project. It is a decision the community already made about that parcel. Your job as a developer is to find out what that decision was.",
        "stats": [
          {
            "value": "9 in 10",
            "label": "Matter of right projects approved without challenge"
          }
        ],
        "takeaways": [
          "Matter of right means the zoning already permits your project — plan approval, then build.",
          "Public input is generally not required for matter of right projects, and roughly nine in ten are approved without challenge.",
          "The community input happened upstream, when the neighborhood was planned and zoned.",
          "Zoning is a decision already made about your parcel, not a hurdle invented for you.",
          "Identify which kind of project you have before you budget time or money."
        ],
        "quote": "History shows that there is always someone or some group of people that oppose development of any kind. So if all projects had to get public input to be built, nothing would be built.",
        "quoteContext": "This is Dr. Merritt being honest about a tension the industry usually talks around. Community input genuinely matters — it is central to how she works — but a system requiring unanimous consent produces no housing. Students need to understand where the public process actually sits in the timeline so they neither dismiss community engagement nor assume it happens at the permit counter.",
        "actionItem": "Pick a site in your target market. Find the jurisdiction's zoning map online and identify the parcel's zoning designation. Write down one sentence: is what I want to build here matter of right, or will it require a rezoning?"
      },
      {
        "id": 2,
        "title": "Coverage, Height & the Shape of Your Building",
        "summary": "Zoning does not just tell you whether you can build housing. It tells you how much of the lot your building can sit on, and how tall it can go. Those two numbers together decide the physical shape of your project.\n\nPicture the same amount of building — identical square footage — dropped onto three different lots.\n\nOn the first lot, the zoning allows the building to cover 100% of the property. So it does. One floor, edge to edge, done.\n\nOn the second lot, the building can only cover half the property. The same square footage has to fit into half the footprint, so it goes up. Two stories.\n\nOn the third, coverage is capped at 25%. A quarter of the footprint, so four stories to hold the same building. Twenty-five percent coverage times four floors gets you back to the same total area.\n\nSame building, three completely different projects. Different construction type, different cost per square foot, different elevator and stair requirements, different neighbors.\n\nAnd there is a condition on all of it: the building only goes up if the zoning allows it to. Coverage limits and height limits are separate rules. A lot restricted to 25% coverage and two stories does not hold the same building at all — it holds half of it. When those two constraints collide, your project shrinks, and it shrinks before you have spent a dollar.\n\nThis is why the zoning check comes first. Not because it is bureaucratic housekeeping, but because it determines what is physically possible on the site — and therefore what revenue the site can ever produce.",
        "table": {
          "title": "Same Building, Three Different Lots",
          "headers": [
            "Lot coverage allowed",
            "Stories needed",
            "Result"
          ],
          "rows": [
            [
              "100%",
              "1",
              "One floor, edge to edge"
            ],
            [
              "50%",
              "2",
              "Half the footprint, twice the height"
            ],
            [
              "25%",
              "4",
              "Quarter footprint × 4 floors = same total area"
            ]
          ]
        },
        "takeaways": [
          "Lot coverage and height limits together determine your building's shape.",
          "The same square footage becomes 1, 2, or 4 stories at 100%, 50%, and 25% coverage.",
          "Going taller to recover footprint only works if the height limit permits it.",
          "Building shape drives construction type and cost per square foot, not just appearance.",
          "Zoning caps what the site can ever earn — which is why it precedes the financial model."
        ],
        "quote": "So with 25% lot coverage times four floors, that gets you to 100% of the building area. Again, only if zoning allows.",
        "quoteContext": "The arithmetic is simple and the caveat is the whole lesson. New developers routinely assume they can recover lost footprint by building taller. Sometimes they can. Often the height limit stops them, and the project they modeled was never possible. Dr. Merritt attaches the condition to the calculation every time she states it, and students should learn it the same way.",
        "actionItem": "For the site from Lesson 1, find the lot coverage limit, the height limit, and the lot size. Calculate the maximum buildable square footage. Compare it against what you assumed the site would hold."
      },
      {
        "id": 3,
        "title": "Rezoning: Trading Benefits for Density",
        "summary": "Sometimes you look at a site and the market says it can carry more than its zoning allows. More units. More height. A different mix of uses. That is when you consider a rezoning.\n\nA rezoning is a planning tool, and its purpose is specific: it is meant to produce development and public benefits that are superior to what a matter of right project would deliver. The approval you receive at the end is called an entitlement, and what it entitles you to is building beyond what the current zoning permits.\n\nUnderstand the shape of that trade. A rezoning typically grants greater flexibility on the site plan, the building height, or the density — in return for superior community benefits. You are not being handed additional density. You are buying it, and the currency is public benefit.\n\nWhat counts as a benefit depends on what the community needs. It might be fixing a traffic problem — adding a signal at an intersection that never had one. It might be a negotiated number of affordable units inside an otherwise luxury apartment building. The specifics are the negotiation.\n\nThis matters enormously for affordable housing developers, and in a way that is easy to miss. Inclusionary zoning — the requirement that market-rate projects include affordable units — lives inside this mechanism. Affordable units become the price a market-rate developer pays for density. Which means the rezoning process is one of the main ways affordable housing gets produced in high-cost markets, whether or not an affordable housing developer is in the room.\n\nUnderstand the trade and you can position yourself on either side of it: as the developer negotiating for density, or as the partner a market-rate developer needs to deliver the affordable component they just agreed to.",
        "takeaways": [
          "A rezoning is meant to deliver public benefits superior to a matter of right project.",
          "The approval you receive is an entitlement — permission to exceed current zoning.",
          "Flexibility on site plan, height, or density is granted in exchange for community benefits.",
          "Benefits range from infrastructure fixes to negotiated affordable units.",
          "Inclusionary zoning operates through this mechanism — which creates partnership openings for affordable developers."
        ],
        "quote": "A rezoning typically permits greater flexibility on the site plan, building height, or density in return for superior community benefits.",
        "quoteContext": "The phrase to sit on is \"in return for.\" Rezoning is a negotiation, not an application. Students who understand that walk into the process with something to offer and a position to hold. Students who do not tend to treat it as paperwork and get outmaneuvered by a community that has been preparing for years.",
        "actionItem": "Find one rezoning approved in your target jurisdiction in the last two years. Identify what the developer received — height, density, use — and what they gave in return. Write both columns down."
      },
      {
        "id": 4,
        "title": "How a Rezoning Actually Gets Evaluated",
        "summary": "If you are going to ask for a rezoning, it helps to know what the people deciding are actually looking at. The evaluation is more structured than most first-time applicants expect.\n\nA jurisdiction analyzing a proposed zoning change typically weighs a consistent set of factors. The comprehensive plan — the long-range document describing where the whole jurisdiction is headed. Any small area plan covering that specific neighborhood in finer detail. Whether a planned unit development applies. The surrounding zoning, and separately, the surrounding development pattern — what is legally permitted nearby versus what is actually standing there, which are frequently not the same. The community position on the project. And finally the benefits and amenities the project itself offers.\n\nAll of that gets considered together when deciding whether a developer should be allowed different or better zoning than the parcel currently carries.\n\nNotice how much of this exists before you arrive. The comprehensive plan was adopted years ago. The small area plan was negotiated by people who live there. The development pattern is physically standing. You are not presenting into a vacuum — you are presenting into a set of documents and expectations that already exist, and your proposal is being measured against them.\n\nWhich is why the first move in any rezoning is reading. Read the comprehensive plan. Read the small area plan. Find the language that describes what the community said it wanted on your block. If your project advances something already written down, your application becomes evidence that the plan is working. If it contradicts that language, you are asking a body to overrule its own adopted policy — and that is a much harder ask, with a much longer timeline and a much larger legal budget.",
        "takeaways": [
          "Rezoning evaluation weighs the comprehensive plan, small area plans, PUDs, surrounding zoning, development pattern, community position, and project benefits.",
          "Surrounding zoning and surrounding development pattern are different things — both are examined.",
          "Most of the evaluating framework predates your application.",
          "Alignment with adopted plans is the strongest position available to you.",
          "Contradicting adopted policy is possible but slow and expensive — budget accordingly."
        ],
        "quote": "All of these things are considered when evaluating whether developers should be allowed to obtain better or different zoning.",
        "quoteContext": "\"Allowed to obtain\" is precise language. Better zoning is not a right and it is not a purchase — it is a discretionary grant, weighed against public documents. Students who internalize that stop treating entitlement as a formality and start doing the reading that actually determines the outcome.",
        "actionItem": "Download your jurisdiction's comprehensive plan and locate the section covering your target site's neighborhood. Find one sentence describing what is intended there. Write down whether your project supports it or contradicts it."
      }
    ]
  },
  {
    "id": "mc7",
    "title": "After Opening Day: Mixed-Use, Compliance & the Fifteen Years Nobody Warns You About",
    "stage": "Stage 7 of 7",
    "stageColor": "#8a8a8a",
    "duration": "~55 min",
    "description": "The building opened — now the real test starts. Mixed-use structures, LIHTC compliance, and running the asset so it stays funded, occupied, and yours for the long haul.",
    "lessons": [
      {
        "id": 1,
        "title": "Why Retail Under Affordable Housing Is So Hard",
        "summary": "Ground-floor retail under apartments looks obvious. It activates the street, it serves residents, it is what everyone means when they say mixed-use. And in affordable housing, it is one of the hardest things to finance.\n\nThe reason traces back to the same rule that governs everything else: revenue drives borrowing. A market-rate building collects high apartment rents and high retail rents, and can borrow against all of it. Affordable housing financing tools generally will not let you use that financing to pay for retail or other commercial uses. The subsidy is for housing. It stops at the housing.\n\nThis is one of the strongest arguments for mixed-income development. The more market-rate rent you can collect, the more uses you can afford to pay for. Mixing incomes serves people across the spectrum and simultaneously makes it possible to bring other uses into the building at all.\n\nFor the commercial portion specifically, there are a few tools. New Markets Tax Credits, a program built to develop commercial facilities in underserved neighborhoods and sometimes used for housing. Community development lenders, who already lend in these neighborhoods and will finance uses beyond housing. Local subsidy — CDBG can fund community facilities, unlike HOME funds, which are housing-only. And owner equity, which in a 100% affordable deal is typically zero, but which a mix of uses may force you to supply. If New Markets doesn't work, the owner may have to use their own money through construction and refinance conventionally once the project is complete.\n\nThen there is the problem underneath the problem, and it is not about money at all.\n\nLIHTC investors and lenders do not like other lenders financing other uses in their building — particularly at the base of a structure with their affordable housing above it. The fear is concrete: if something goes wrong with the development of that commercial space, that commercial lender can step into the project and take it over to make sure the building gets built. And at that point the affordable housing lender and the tax credit investor have no rights to ensure their part of the project gets finished. Their credits are attached to a building somebody else now controls.\n\nIt gets complicated. It is not impossible — but it is difficult, and it is a real reason mixed-use affordable projects die at the financing stage.",
        "takeaways": [
          "Affordable housing financing tools generally cannot pay for retail or commercial uses.",
          "Mixed-income development expands what the building can afford to include.",
          "Commercial tools: NMTCs, CDFI lenders, CDBG (unlike HOME), and owner equity.",
          "The deeper obstacle is control: a commercial lender stepping in can strip the tax credit investor of any right to see the building finished.",
          "Solvable, but it must be structured deliberately — not discovered at closing."
        ],
        "quote": "In essence, companies that develop affordable housing deal with a lot of brain damage in getting these developments built.",
        "quoteContext": "It is a rare moment of plain frustration from someone who has done this for three decades, and it should stay in exactly as she said it. Students hearing about intercreditor risk for the first time need to know the difficulty is structural, not a reflection of their own inexperience. Dr. Merritt naming it as brain damage is permission to find it hard.",
        "actionItem": "Find one mixed-use affordable project in your market. Look up who financed the commercial space versus the residential space — the CDE, the bank, the housing agency. Write down whether they were the same entity."
      },
      {
        "id": 2,
        "title": "How Developers Actually Solve It",
        "summary": "Dr. Merritt names the problem. Here is how the industry answers it — because there are two well-established structures, and choosing between them is one of the more consequential early decisions in a mixed-use deal.\n\nThe first is the condominium regime. You legally divide the building into separately owned units — typically a residential unit and a commercial unit — surrounded by common areas owned jointly. The tax credit project becomes the residential condominium unit and nothing else. The commercial space is a different unit with a different owner, sharing no income and no depreciation with the housing. Common expenses get split by a formula agreed at the outset. The developer can keep the commercial unit, and it does not get sold with the rest of the project at year fifteen.\n\nWhat makes this powerful is that it isolates the residential portion from the commercial one, which reduces or eliminates the risk that the project fails to qualify as residential rental property at all. And LIHTC investors increasingly prefer it — they would rather not own small commercial spaces, with all the leasing and management that entails. Some institutional investors ask for the commercial space to be split off even when it is likely to succeed and already has a strong long-term tenant signed.\n\nThe second structure is the master lease. The developer, or an affiliate, signs a lease taking the commercial space from the ownership entity, pays rent back to the partnership, and then subleases to the actual businesses. The developer absorbs the vacancy risk instead of the partnership. If the commercial space underperforms long-term, the developer can renegotiate with their project partners rather than default.\n\nThere is also a variation on the condominium worth knowing: a vertical or airspace subdivision, which divides the airspace into separate legal parcels rather than condominium units. It can create cleaner separation between residential and commercial owners, but many building codes were never written with vertical parcels in mind, and its availability varies significantly by jurisdiction.\n\nThe decision belongs at the front of the deal, not the back. Both structures require legal work, both change how expenses are shared for the life of the building, and neither can be retrofitted cheaply once the capital stack is assembled.",
        "table": {
          "title": "Condominium Regime vs. Master Lease",
          "headers": [
            "",
            "Condominium regime",
            "Master lease"
          ],
          "rows": [
            [
              "Ownership",
              "Residential and commercial are separately owned units",
              "Partnership owns it all; developer leases the commercial space"
            ],
            [
              "Who holds vacancy risk",
              "The commercial unit's owner",
              "The developer, directly"
            ],
            [
              "Tax credit protection",
              "Isolates the LIHTC project; protects residential rental classification",
              "Commercial stays inside the partnership"
            ],
            [
              "Year-15 treatment",
              "Developer can keep the commercial unit — it is not sold with the project",
              "Commercial follows the partnership disposition"
            ]
          ]
        },
        "takeaways": [
          "Condominium regime: residential and commercial become separate units with separate owners.",
          "Condo structure isolates the tax credit project and protects residential rental classification.",
          "LIHTC investors often prefer it — many would rather not own commercial space at all.",
          "Master lease: the developer leases the commercial space and absorbs vacancy risk directly.",
          "Vertical/airspace subdivision is an alternative, but code support varies widely by jurisdiction.",
          "Decide the structure early — it shapes ownership, expenses, and year-15 disposition."
        ],
        "quote": "This is a challenge for affordable housing developers, to develop projects with a mix of uses in the building. It's not impossible, but it is difficult.",
        "quoteContext": "\"Not impossible, but difficult\" is the right posture for this entire lesson. The structures exist and they work — developers use them every day. But they require legal cost, early decision-making, and partners who have done it before. Students should leave knowing the problem is solvable and knowing not to improvise the solution.",
        "actionItem": "Ask a real estate attorney in your market what a condominium regime costs to establish on a mixed-use project, and whether vertical subdivision is available in your jurisdiction. Write both answers down before your next mixed-use pro forma."
      },
      {
        "id": 3,
        "title": "The Fifteen-Year Clock",
        "summary": "You cut the ribbon. Residents move in. And now the part of the deal that can still take your money back begins.\n\nAn affordable housing owner relies on the property manager for far more than upkeep. The manager keeps the property maintained, cares for residents, enforces house rules — and critically, verifies that every household meets the income guidelines each time a lease is granted or renewed.\n\nHere is the rule residents most often misunderstand, and every developer should be able to explain clearly: you have to meet the income limits when you sign your first lease. After that, you can earn more, improve your position, and stay. Nobody is evicted for succeeding. The test is at initial occupancy.\n\nYour investors and lenders require reporting throughout because they need to know the property operates as expected and that leased units meet the income requirements. And if they do not — the tax credit investor in particular can require the developer to repay the money they invested in the project.\n\nThat mechanism is called recapture, and it is worth understanding in specifics. When a state agency finds a unit out of compliance, it reports the noncompliance to the IRS on Form 8823. Agencies typically allow a cure period, often thirty to ninety days, to fix the problem first. But some errors cannot be cured retroactively — moving in a fundamentally unqualified household is the classic example. If the first-year tenant file is defective, the unit may never have been a qualified low-income unit at all. Credits claimed against it were never earned, and the IRS can require them back with interest.\n\nThe clock has two phases. The federal compliance period runs fifteen years. After that, an extended use agreement with the state agency runs at least another fifteen — thirty years of affordability minimum, and considerably longer in some states. During the extended use period, state agencies continue monitoring, but noncompliance generally is not reported to the IRS and generally will not trigger recapture under Section 42. Recertification rules vary substantially state to state; some permit self-certification after the initial year, and 100% LIHTC properties often have lighter requirements than properties carrying layered subsidy.\n\nWhich leads to the practical point. Property management for a tax credit property is not the same job as property management. It is a compliance function wearing a leasing hat, and the person doing it needs real experience monitoring and reporting on tax credit requirements. A manager who leases to the wrong household has not made a leasing error. They have created a financial event for the owner.",
        "stats": [
          {
            "value": "15 yrs",
            "label": "Federal compliance period"
          },
          {
            "value": "15+ yrs",
            "label": "Extended use after that — 30 years minimum"
          },
          {
            "value": "30–90 days",
            "label": "Typical cure period before Form 8823 goes to the IRS"
          }
        ],
        "takeaways": [
          "Income eligibility is tested at initial lease — residents may earn more later and stay.",
          "Investors and lenders require ongoing reporting that units remain properly leased.",
          "Noncompliance is reported to the IRS on Form 8823, usually after a 30–90 day cure period.",
          "A defective first-year file may mean the unit never qualified — and that cannot be cured retroactively.",
          "15-year federal compliance, then 15+ years extended use; monitoring continues, recapture risk generally does not.",
          "Tax credit property management is a compliance discipline. Hire for it accordingly."
        ],
        "quote": "The property manager really needs to have significant experience monitoring and reporting on the requirements for tax credit properties — they need to ensure that they lease to the appropriate person so that the owner doesn't have any financial impacts.",
        "quoteContext": "Property management is where first-time developers most often economize, because it looks like a commodity service. Dr. Merritt is warning that on a tax credit deal it is a risk control. The cheapest manager who has never handled LIHTC compliance can cost an owner the credits that financed the building — a consequence that arrives years after the hiring decision was made.",
        "actionItem": "Write down the three questions you would ask a prospective property manager to test their tax credit compliance experience. If you cannot think of three, that is the gap this lesson was written to close."
      },
      {
        "id": 4,
        "title": "Partnerships, Services & the Long Life of a Building",
        "summary": "Compliance keeps the deal intact. It does not make the building good. What determines that is everything you organize around the residents once they are living there.\n\nCommunity partnerships come first. Organizations in your neighborhood that provide support and services can be invited into your property — to use the community room or the lobby, to host events, to deliver services on site. Access to education. Childcare. Employment opportunities. These partners play a real role in the long-term success of the development, and the space to host them is something you either designed in or you didn't.\n\nThe services themselves are frequently not optional. Public housing redevelopment programs and public financing programs typically require them. In practice that means adult and youth education, financial literacy — banking practices, credit repair — job training and job placement, health and wellness, family counseling, youth activities from tutoring to movie nights to arts and crafts, and entrepreneurship: how to write a business plan, how to market a company to customers.\n\nThen resident participation, which Dr. Merritt treats as the whole point. Residents should organize and participate in the daily life of the property and in their relationship with management. They are the most critical part of the process. It is their home, and their voice should carry in what happens there. They should maintain a relationship with the property manager and expect respect — and they should hold each other to the same standard of care for the building, because one bad actor genuinely can affect everyone. House rules exist to protect residents and owner alike, applied fairly and equally.\n\nAnd the direction is forward. The phrase she uses is onward and upward: connecting residents to services that improve their quality of life and their ability to earn more. At some point it would be a good thing for a resident to move out of affordable housing entirely — and the development should be helping them get there.\n\nThat is a different definition of a successful project than the one in your pro forma. The pro forma measures whether the building performs. This measures whether the building did anything for the people inside it. Both are your job.",
        "takeaways": [
          "Community partners need physical space — design the community room for it, don't retrofit.",
          "Service provision is often required by public financing and redevelopment programs.",
          "Typical services: education, financial literacy, job training, health, counseling, youth programming, entrepreneurship.",
          "Resident organization and voice are central, not decorative.",
          "House rules protect residents and owner alike when applied fairly.",
          "Success includes residents eventually not needing the unit."
        ],
        "quote": "Resident participation is really the end-all, be-all. As you know, residents are the most critical part of the whole process.",
        "quoteContext": "This is the thread running through everything Dr. Merritt builds, and it belongs at the end of the journey rather than the beginning — after a student has learned how genuinely hard the financing is. Anyone can say residents matter before they understand the deal. Saying it after fifteen years of compliance risk and negative land values is a different statement, and that is where it lands hardest.",
        "actionItem": "Identify three organizations serving your target neighborhood — workforce, education, health, or financial counseling. Call one and ask what they would need from a building to deliver services on site. Design that into your next project."
      }
    ]
  }
];

export default NEW_COURSES;
